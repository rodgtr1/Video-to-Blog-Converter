import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import busboy from 'busboy'
import { Readable } from 'stream'
import { SecureCommandExecutor } from '@/lib/secure-exec'
import { validateRequestBody, transcribeYouTubeSchema, validateFileSize, sanitizeFilename } from '@/lib/validation'
import { transcriptionRateLimit, getClientIdentifier } from '@/lib/rate-limit'

// Configure the runtime and body size limits
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const clientId = getClientIdentifier(request)
    const rateLimitResult = transcriptionRateLimit(clientId)
    
    if (!rateLimitResult.allowed) {
      const resetTime = new Date(rateLimitResult.resetTime)
      return NextResponse.json({
        success: false,
        error: `Rate limit exceeded. Try again at ${resetTime.toLocaleTimeString()}`
      }, { 
        status: 429,
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
        }
      })
    }
    
    const contentType = request.headers.get('content-type')
    console.log('Content-Type:', contentType)
    console.log('Request method:', request.method)
    console.log('Request URL:', request.url)

    // Check if this is a form data request (file upload)
    if (contentType?.includes('multipart/form-data')) {
      return await handleFileUpload(request)
    } else {
      // Assume this is a JSON request (YouTube URL)
      return await handleYouTubeUrl(request)
    }
  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

async function handleFileUpload(request: NextRequest) {
  try {
    console.log('Attempting to parse multipart data manually...')

    // Check if the request body is readable
    if (!request.body) {
      throw new Error('No request body found')
    }

    const contentType = request.headers.get('content-type')
    if (!contentType) {
      throw new Error('No content-type header found')
    }

    // Parse multipart data manually using busboy
    const fileData = await parseMultipartData(request.body, contentType)

    if (!fileData) {
      throw new Error('No video file found in upload')
    }

    console.log('File parsed successfully:', fileData.filename, '(' + fileData.buffer.length + ' bytes)')

    // Check file size using validation utility
    const maxSize = 2 * 1024 * 1024 * 1024 // 2GB
    if (!validateFileSize(fileData.buffer, maxSize)) {
      console.log('File too large:', fileData.buffer.length, 'bytes')
      const sizeInGB = (fileData.buffer.length / (1024 * 1024 * 1024)).toFixed(2)
      return NextResponse.json({
        success: false,
        error: `File too large (${sizeInGB}GB). Maximum size is 2GB. Consider compressing your video first.`
      }, { status: 400 })
    }

    // Check file type
    const allowedTypes = ['video/', 'audio/']
    const isValidType = allowedTypes.some(type => fileData.mimetype?.startsWith(type))
    if (!isValidType) {
      console.log('Invalid file type:', fileData.mimetype)
      return NextResponse.json({
        success: false,
        error: 'Invalid file type. Please upload a video or audio file.'
      }, { status: 400 })
    }
  
    const tempDir = '/tmp'
    const sanitizedFilename = sanitizeFilename(fileData.filename)
    const videoPath = join(tempDir, `video_${Date.now()}_${sanitizedFilename}`)
    const audioPath = join(tempDir, `audio_${Date.now()}.wav`)
    console.log('Temp paths:', { videoPath, audioPath })
  
    try {
      console.log('Writing file to:', videoPath)
      await writeFile(videoPath, fileData.buffer)

      console.log('Converting video to audio...')
      await SecureCommandExecutor.executeFFmpeg(videoPath, audioPath)

      console.log('Transcribing audio...')
      const transcript = await SecureCommandExecutor.executeWhisper(audioPath)

      console.log('Cleaning up files...')
      await unlink(videoPath)
      await unlink(audioPath)

      console.log('Transcription completed successfully')
      return NextResponse.json({
        success: true,
        text: transcript
      })

    } catch (error) {
      console.error('Error in file processing:', error)
      try {
        await unlink(videoPath)
        await unlink(audioPath)
      } catch {}

      throw error
    }
  } catch (error) {
    console.error('Error in handleFileUpload:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process file upload'
    }, { status: 500 })
  }
}

async function handleYouTubeUrl(request: NextRequest) {
  // Validate input
  const validation = await validateRequestBody(request, transcribeYouTubeSchema)
  if (validation.error || !validation.data) {
    return NextResponse.json({
      success: false,
      error: validation.error || 'Validation failed'
    }, { status: 400 })
  }
  
  const { youtubeUrl } = validation.data

  const tempDir = '/tmp'
  const audioPath = join(tempDir, `youtube_audio_${Date.now()}.wav`)
  
  try {
    await SecureCommandExecutor.executeYtDlp(youtubeUrl, audioPath)
    
    const transcript = await SecureCommandExecutor.executeWhisper(audioPath)
    
    await unlink(audioPath)
    
    return NextResponse.json({
      success: true,
      text: transcript
    })
    
  } catch (error) {
    try {
      await unlink(audioPath)
    } catch {}
    
    throw error
  }
}

async function parseMultipartData(
  body: ReadableStream<Uint8Array>,
  contentType: string
): Promise<{ filename: string; buffer: Buffer; mimetype?: string } | null> {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: { 'content-type': contentType } })
    let fileData: { filename: string; buffer: Buffer; mimetype?: string } | null = null

    bb.on('file', (name, file, info) => {
      console.log('Receiving file:', info.filename, info.mimeType)
      const chunks: Buffer[] = []

      file.on('data', (chunk) => {
        chunks.push(chunk)
      })

      file.on('end', () => {
        const buffer = Buffer.concat(chunks)
        fileData = {
          filename: info.filename || 'upload',
          buffer,
          mimetype: info.mimeType
        }
        console.log('File received:', buffer.length, 'bytes')
      })
    })

    bb.on('finish', () => {
      resolve(fileData)
    })

    bb.on('error', (err) => {
      console.error('Busboy error:', err)
      reject(err)
    })

    // Convert ReadableStream to Node.js Readable stream
    const readable = Readable.fromWeb(body as import('stream/web').ReadableStream)
    readable.pipe(bb)
  })
}

