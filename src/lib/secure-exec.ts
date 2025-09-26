import { spawn } from 'child_process'
import { access, constants } from 'fs/promises'
import path from 'path'

// Whitelist allowed characters for file paths (more restrictive)
const SAFE_PATH_REGEX = /^[a-zA-Z0-9\-_./]+$/

// YouTube URL validation (supports both formats with optional query parameters)
const YOUTUBE_URL_PATTERNS = [
  /^https:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}(&.*)?$/,
  /^https:\/\/(www\.)?youtu\.be\/[a-zA-Z0-9_-]{11}(\?.*)?$/
]

export class SecureCommandExecutor {
  private static async validatePath(filePath: string): Promise<boolean> {
    if (!SAFE_PATH_REGEX.test(filePath)) {
      throw new Error('Invalid characters in file path')
    }
    
    // Ensure path is within expected directories
    const resolvedPath = path.resolve(filePath)
    const tmpDir = path.resolve('/tmp')
    
    if (!resolvedPath.startsWith(tmpDir)) {
      throw new Error('File path outside allowed directory')
    }
    
    return true
  }

  private static validateYouTubeUrl(url: string): boolean {
    return YOUTUBE_URL_PATTERNS.some(pattern => pattern.test(url))
  }

  static async executeFFmpeg(inputPath: string, outputPath: string): Promise<void> {
    await this.validatePath(inputPath)
    await this.validatePath(outputPath)
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        outputPath
      ])
      
      let stderr = ''
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`))
        } else {
          resolve()
        }
      })
      
      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`))
      })
    })
  }

  static async executeYtDlp(youtubeUrl: string, outputPath: string): Promise<void> {
    if (!this.validateYouTubeUrl(youtubeUrl)) {
      throw new Error('Invalid YouTube URL format')
    }
    
    await this.validatePath(outputPath)
    
    return new Promise((resolve, reject) => {
      const ytDlp = spawn('yt-dlp', [
        '-x',
        '--audio-format', 'wav',
        '--audio-quality', '0',
        '--extractor-args', 'youtube:player_client=android,web',
        '--user-agent', 'Mozilla/5.0 (Linux; Android 11; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        '--referer', 'https://m.youtube.com/',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--extractor-retries', '5',
        '--fragment-retries', '5',
        '--retry-sleep', '3',
        '--sleep-interval', '2',
        '--max-sleep-interval', '10',
        '--no-warnings',
        '-o', outputPath.replace('.wav', '.%(ext)s'),
        youtubeUrl
      ])
      
      let stderr = ''
      
      ytDlp.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      
      ytDlp.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`))
        } else {
          resolve()
        }
      })
      
      ytDlp.on('error', (error) => {
        reject(new Error(`yt-dlp spawn error: ${error.message}`))
      })
    })
  }

  static async executeWhisper(audioPath: string): Promise<string> {
    await this.validatePath(audioPath)
    
    // Use a separate Python file instead of inline code
    const pythonScript = path.join(process.cwd(), 'scripts', 'transcribe.py')
    
    try {
      await access(pythonScript, constants.F_OK)
    } catch {
      throw new Error('Transcription script not found')
    }
    
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [pythonScript, audioPath])
      
      let stdout = ''
      let stderr = ''
      
      python.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      
      python.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      
      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Transcription failed with code ${code}: ${stderr}`))
        } else {
          resolve(stdout.trim())
        }
      })
      
      python.on('error', (error) => {
        reject(new Error(`Python spawn error: ${error.message}`))
      })
    })
  }
}