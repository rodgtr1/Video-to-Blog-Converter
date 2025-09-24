'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlphaSlider } from '@/components/AlphaSlider'
import { BlogPreview } from '@/components/BlogPreview'
import { transcribeVideo, transcribeYouTube, generateBlogPostWithProgress, saveResults } from '@/lib/client'
import { Upload, Link, Video } from 'lucide-react'

export default function Home() {
  const [alpha, setAlpha] = useState(0.5)
  const [targetWordCount, setTargetWordCount] = useState(500)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file')
  const [isProcessing, setIsProcessing] = useState(false)
  const [blogPost, setBlogPost] = useState<{
    title: string
    excerpt: string
    content: string
    tags: string[]
    headings?: Array<{level: number, text: string}>
    word_count?: number
    reading_time_minutes?: number
    sources?: Array<{type: 'video', url?: string, timestamps?: string[]}>
    videoUrl?: string
  } | null>(null)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')
  const [detailedSteps, setDetailedSteps] = useState<Array<{step: string, status: 'pending' | 'active' | 'complete', details?: string}>>([])
  const [startTime, setStartTime] = useState<number | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setVideoFile(file)
      setYoutubeUrl('')
    }
  }

  // updateProgress function removed - no longer used with streaming progress

  const updateDetailedStep = (stepName: string, status: 'pending' | 'active' | 'complete', details?: string) => {
    setDetailedSteps(prev => {
      const existing = prev.find(s => s.step === stepName)
      if (existing) {
        return prev.map(s => s.step === stepName ? { ...s, status, details } : s)
      } else {
        return [...prev, { step: stepName, status, details }]
      }
    })
  }

  const initializeSteps = (isLongTranscript: boolean = false) => {
    const baseSteps = [
      { step: 'Transcription', status: 'pending' as const },
      { step: 'Analysis', status: 'pending' as const },
    ]
    
    if (isLongTranscript) {
      baseSteps.push(
        { step: 'Chunking', status: 'pending' as const },
        { step: 'Outline Generation', status: 'pending' as const },
        { step: 'Section Writing', status: 'pending' as const },
        { step: 'Assembly', status: 'pending' as const },
        { step: 'Saving', status: 'pending' as const }
      )
    } else {
      baseSteps.push(
        { step: 'Outline Generation', status: 'pending' as const },
        { step: 'Section Writing', status: 'pending' as const },
        { step: 'Length Check', status: 'pending' as const },
        { step: 'Final Assembly', status: 'pending' as const },
        { step: 'Saving', status: 'pending' as const }
      )
    }
    
    setDetailedSteps(baseSteps)
  }

  const getElapsedTime = () => {
    if (!startTime) return '0s'
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    return elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  }

  const handleProcess = async () => {
    if (!videoFile && !youtubeUrl) {
      setStatus('Please provide a video file or YouTube URL')
      return
    }

    setIsProcessing(true)
    setBlogPost(null)
    setProgress(0)
    setStartTime(Date.now())
    setCurrentStep('Starting process...')
    
    try {
      // Step 1: Transcription
      updateDetailedStep('Transcription', 'active', 'Processing video/audio...')
      setCurrentStep('Transcribing audio with AI...')
      
      const transcriptionResult = videoFile 
        ? await transcribeVideo(videoFile)
        : await transcribeYouTube(youtubeUrl)

      if (!transcriptionResult.success) {
        throw new Error(transcriptionResult.error || 'Transcription failed')
      }

      updateDetailedStep('Transcription', 'complete', `Transcribed ${transcriptionResult.text.length} characters`)
      setProgress(15)

      // Step 2: Analysis
      updateDetailedStep('Analysis', 'active', 'Analyzing transcript content...')
      setCurrentStep('Analyzing transcript and preparing for blog generation...')
      
      // Determine if it's a long transcript to show appropriate steps
      const isLongTranscript = transcriptionResult.text.length > 12000
      initializeSteps(isLongTranscript)
      
      // Update the completed steps
      updateDetailedStep('Transcription', 'complete', `Transcribed ${transcriptionResult.text.length} characters`)
      updateDetailedStep('Analysis', 'complete', `${isLongTranscript ? 'Long' : 'Standard'} transcript detected`)
      setProgress(20)
      
      // Step 3: Blog Generation with Streaming Progress
      setCurrentStep('Generating detailed blog post...')
      
      const blogResult = await generateBlogPostWithProgress(
        transcriptionResult.text,
        alpha,
        youtubeUrl || undefined,
        targetWordCount,
        (progressUpdate) => {
          // Handle streaming progress updates
          setProgress(20 + Math.round(progressUpdate.progress * 0.8)) // Scale from 20-100%
          
          // Map backend progress steps to user-friendly display steps
          const stepMapping: Record<string, {displayStep: string, details?: string}> = {
            'pure_transcript': { displayStep: 'Transcription', details: 'Formatting pure transcript' },
            'chunking': { displayStep: 'Chunking', details: progressUpdate.details },
            'outline_start': { displayStep: 'Outline Generation', details: 'Creating blog structure' },
            'outline_generated': { displayStep: 'Outline Generation', details: progressUpdate.details },
            'outline_complete': { displayStep: 'Outline Generation', details: progressUpdate.details },
            'sections_start': { displayStep: 'Section Writing', details: progressUpdate.details },
            'section_start': { displayStep: 'Section Writing', details: progressUpdate.details },
            'section_complete': { displayStep: 'Section Writing', details: progressUpdate.details },
            'section_retry': { displayStep: 'Section Writing', details: progressUpdate.details },
            'long_section_start': { displayStep: 'Section Writing', details: progressUpdate.details },
            'long_section_complete': { displayStep: 'Section Writing', details: progressUpdate.details },
            'assembly_start': { displayStep: 'Final Assembly', details: 'Combining sections into final post' },
            'checking_length': { displayStep: 'Length Check', details: progressUpdate.details },
            'expanding': { displayStep: 'Length Check', details: progressUpdate.details },
            'long_assembly': { displayStep: 'Assembly', details: progressUpdate.details },
            'complete': { displayStep: 'Final Assembly', details: progressUpdate.details }
          }
          
          const mapping = stepMapping[progressUpdate.step]
          if (mapping) {
            const status = progressUpdate.step === 'complete' ? 'complete' : 'active'
            updateDetailedStep(mapping.displayStep, status, mapping.details || progressUpdate.details)
            setCurrentStep(mapping.details || progressUpdate.details || mapping.displayStep)
          } else {
            // Fallback for unmapped steps
            setCurrentStep(progressUpdate.details || progressUpdate.step)
          }
        }
      )

      if (!blogResult.success) {
        throw new Error(blogResult.error || 'Blog generation failed')
      }

      // Mark all steps as complete
      detailedSteps.forEach(step => {
        updateDetailedStep(step.step, 'complete')
      })

      const finalBlogPost = {
        title: blogResult.title,
        excerpt: blogResult.excerpt,
        content: blogResult.content,
        tags: blogResult.tags,
        headings: blogResult.headings,
        word_count: blogResult.word_count,
        reading_time_minutes: blogResult.reading_time_minutes,
        sources: blogResult.sources,
        videoUrl: youtubeUrl || undefined
      }

      setBlogPost(finalBlogPost)
      
      // Save results to files
      updateDetailedStep('Saving', 'active', 'Saving transcript and blog post to files...')
      setCurrentStep('Saving results to files...')
      const videoTitle = videoFile?.name || youtubeUrl?.split('v=')[1] || blogResult.title || 'untitled-video'
      const saveResult = await saveResults(videoTitle, transcriptionResult.text, blogResult)
      
      if (saveResult.success) {
        updateDetailedStep('Saving', 'complete', `Saved ${saveResult.files?.length || 0} files`)
        setProgress(100)
        setCurrentStep(`Blog post generated and saved successfully!`)
        setStatus(`Blog post generated and saved to: ${saveResult.savedTo}`)
        console.log('Results saved to:', saveResult.savedTo)
      } else {
        updateDetailedStep('Saving', 'complete', `Save failed: ${saveResult.error}`)
        setProgress(100)
        setCurrentStep('Blog post generated successfully! (Save failed)')
        setStatus(`Blog post generated successfully! Note: Failed to save files - ${saveResult.error}`)
        console.error('Failed to save results:', saveResult.error)
      }
      
    } catch (error) {
      // Mark current active step as failed
      const activeStep = detailedSteps.find(s => s.status === 'active')
      if (activeStep) {
        updateDetailedStep(activeStep.step, 'pending', 'Failed')
      }
      
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setProgress(0)
      setCurrentStep('')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Video to Blog Converter</h1>
        <p className="text-gray-600">
          Transform videos into engaging blog posts using AI transcription and generation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Input Section */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Video Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={inputMode === 'file' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInputMode('file')}
                  className="flex-1"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  File
                </Button>
                <Button
                  variant={inputMode === 'url' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInputMode('url')}
                  className="flex-1"
                >
                  <Link className="w-4 h-4 mr-1" />
                  YouTube
                </Button>
              </div>

              {inputMode === 'file' ? (
                <div>
                  <Input
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="mb-2"
                  />
                  {videoFile && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Video className="w-4 h-4" />
                      {videoFile.name}
                    </div>
                  )}
                </div>
              ) : (
                <Input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => {
                    setYoutubeUrl(e.target.value)
                    setVideoFile(null)
                  }}
                />
              )}

              <Button
                onClick={handleProcess}
                disabled={isProcessing || (!videoFile && !youtubeUrl)}
                className="w-full"
              >
                {isProcessing ? 'Processing...' : 'Generate Blog Post'}
              </Button>

              {/* Progress Section */}
              {isProcessing && (
                <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-blue-700">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  {/* Current Step */}
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-blue-700 font-medium">
                      {currentStep}
                    </div>
                    <div className="text-xs text-blue-600">
                      {getElapsedTime()}
                    </div>
                  </div>
                  
                  {/* Detailed Steps */}
                  {detailedSteps.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-blue-600 font-medium">Detailed Progress:</div>
                      <div className="space-y-1">
                        {detailedSteps.map((step, index) => (
                          <div key={index} className="flex items-start gap-2 text-xs">
                            <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${
                              step.status === 'complete' 
                                ? 'bg-green-500' 
                                : step.status === 'active' 
                                  ? 'bg-blue-500 animate-pulse' 
                                  : 'bg-gray-300'
                            }`}></div>
                            <div className={`flex-1 min-w-0 ${
                              step.status === 'complete' 
                                ? 'text-green-700' 
                                : step.status === 'active' 
                                  ? 'text-blue-700 font-medium' 
                                  : 'text-gray-600'
                            }`}>
                              <div className="break-words">{step.step}</div>
                              {step.details && (
                                <div className="text-gray-500 break-words text-xs leading-tight mt-0.5">
                                  {step.details}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status/Error Messages */}
              {status && !isProcessing && (
                <div className={`text-sm p-2 rounded ${
                  status.includes('Error') 
                    ? 'bg-red-50 text-red-700 border border-red-200' 
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                  {status}
                </div>
              )}
            </CardContent>
          </Card>

          <AlphaSlider value={alpha} onChange={setAlpha} />
          
          {/* Word Count Control */}
          <Card>
            <CardHeader>
              <CardTitle>Target Word Count</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Words: {targetWordCount}</div>
                <Input
                  id="wordCount"
                  type="range"
                  min="200"
                  max="1500"
                  step="50"
                  value={targetWordCount}
                  onChange={(e) => setTargetWordCount(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Short (200)</span>
                  <span>Medium (500)</span>
                  <span>Long (1500)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Section */}
        <div className="lg:col-span-2">
          <BlogPreview 
            blogPost={blogPost} 
            isLoading={isProcessing} 
            onBlogPostUpdate={setBlogPost}
          />
        </div>
      </div>
    </div>
  )
}