# 🎬➡️📝 Video To Blog Converter

Transform your videos into engaging blog posts with AI-powered transcription and content generation. Features precise word count control, intelligent content structuring, and real-time progress tracking.

[![Next.js](https://img.shields.io/badge/Next.js-15.5.4-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://typescriptlang.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-green)](https://openai.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

### 🎯 Core Functionality
- **📹 Multiple Input Sources**: Upload video files or provide YouTube URLs
- **🎤 AI Transcription**: Powered by Whisper for accurate speech-to-text
- **🤖 Dual AI Provider Support**: Choose between OpenAI (GPT-4) or Ollama (local/free)
- **📚 Intelligent Blog Generation**: Advanced content creation with customizable styles
- **📊 Real-time Progress Tracking**: Detailed step-by-step progress with live updates
- **💾 Automatic Saving**: All generated content saved locally for future reference
- **📂 Saved Posts Management**: Browse, reload, and manage previously generated posts via intuitive drawer UI
- **🔄 Post Regeneration**: Regenerate any saved post with different parameters (alpha, word count) while preserving all versions

### 🔧 Customization Options
- **🎚️ Alpha Slider**: Control content style from extractive (0.0) to creative (1.0)
  - **α = 0.0**: Pure transcript with minimal formatting
  - **α = 0.1-0.4**: Extractive mode - stays close to original content
  - **α = 0.5-1.0**: Creative mode - restructures for better blog flow
- **📏 Precise Word Count Control**: Generate posts from 200 to 1,500+ words with ±3% accuracy
  - Intelligent section allocation that sums to exact target
  - Target-based prompting prevents length overshoot
  - Global shrink pass ensures final accuracy
- **🏷️ Smart Tagging**: Automatic tag generation based on content
- **📖 Reading Time Estimation**: Automatic calculation of estimated reading time
- **🧠 Content-Driven Structure**: Automatically detects natural sections and optimizes organization

### 🔒 Security & Performance
- **🛡️ Input Validation**: Comprehensive validation using Zod schemas
- **⚡ Rate Limiting**: Built-in protection against abuse
- **🔐 Secure Command Execution**: Prevents injection attacks
- **📁 Path Traversal Protection**: Safe file handling and storage
- **🌐 Environment Validation**: Secure configuration management

### 💡 Advanced Features
- **📱 Responsive Design**: Works on desktop, tablet, and mobile
- **🔄 Streaming Progress**: Real-time updates during processing
- **📂 Organized Output**: Structured file organization with metadata
- **🗂️ Saved Posts Library**: Left-side drawer with all your generated posts
- **🔄 One-Click Reload**: Load any previously generated post back into the editor
- **🔁 Smart Regeneration**: Regenerate any post with different alpha/word count settings
- **📚 Version Management**: Automatic versioning preserves all generated variations
- **🗑️ Post Management**: Delete unwanted posts directly from the UI
- **🎨 Modern UI**: Clean, intuitive interface built with Tailwind CSS
- **⚡ Performance Optimized**: Built with Next.js 15 and Turbopack

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have these installed:

#### Required
- **Node.js 18+** and npm ([Download here](https://nodejs.org/))
- **Python 3.8+** with pip ([Download here](https://python.org/))
- **AI Provider** (choose one):
  - **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys)) - Recommended for best quality
  - **Ollama** ([Install here](https://ollama.ai/)) - Free local alternative

#### System Dependencies

**macOS (using Homebrew):**
```bash
# Install Homebrew if you haven't already
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required tools
brew install ffmpeg yt-dlp python3
```

**Windows (using Chocolatey):**
```powershell
# Install Chocolatey if you haven't already (run as Administrator)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install required tools
choco install ffmpeg python3 nodejs
pip install yt-dlp
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg python3 python3-pip nodejs npm
pip3 install yt-dlp
```

**CentOS/RHEL/Fedora:**
```bash
# Fedora/RHEL 8+
sudo dnf install ffmpeg python3 python3-pip nodejs npm

# CentOS 7 (requires EPEL)
sudo yum install epel-release
sudo yum install ffmpeg python3 python3-pip nodejs npm

pip3 install yt-dlp
```

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/video-to-blog-converter.git
cd video-to-blog-converter
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Alternative: Install Python dependencies manually
# pip install faster-whisper yt-dlp

# Verify installations
node --version    # Should be 18+
python3 --version # Should be 3.8+
ffmpeg -version   # Should show FFmpeg info
yt-dlp --version  # Should show version number
```

**Note**: If you encounter permission issues on macOS/Linux, you might need to use `pip3 install --user -r requirements.txt` instead.

### 3. Environment Setup

Copy the example environment file and configure your settings:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your OpenAI API key:

```env
# AI Provider Configuration (choose one)
# Option 1: OpenAI (recommended for quality)
OPENAI_API_KEY=your-openai-api-key-here

# Option 2: Ollama (free local alternative)
# Leave OPENAI_API_KEY unset to use Ollama automatically
# OLLAMA_BASE_URL=http://localhost:11434  # Optional: custom Ollama URL

# Development Settings
NODE_ENV=development
DEBUG_GEN=0  # Set to 1 for detailed logging

# File Upload Limits (2GB in bytes)
MAX_FILE_SIZE=2147483648

# Security Settings (optional)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### 🔑 Getting Your OpenAI API Key

1. Visit [OpenAI's API platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to the [API Keys section](https://platform.openai.com/api-keys)
4. Click "Create new secret key"
5. Name your key (e.g., "Video Blog Converter")
6. Copy the key and paste it into your `.env.local` file
7. **Important**: Keep your API key secure and never commit it to version control

**Pricing Note**: 
- **OpenAI**: Uses GPT-4, costs about $0.01-0.05 per blog post. Monitor usage in the [OpenAI dashboard](https://platform.openai.com/usage)
- **Ollama**: Completely free! Runs locally on your machine

### 🦙 Using Ollama (Local/Free Alternative)

If you prefer to run models locally or want to avoid OpenAI costs:

1. **Install Ollama**:
   ```bash
   # macOS
   brew install ollama
   
   # Or download from https://ollama.ai/
   ```

2. **Pull the required model**:
   ```bash
   ollama pull llama3.1:8b-instruct
   ```

3. **Start Ollama server**:
   ```bash
   ollama serve
   ```

4. **Skip the OpenAI API key**: Simply don't set `OPENAI_API_KEY` in your `.env.local`

5. **Run the app**: It will automatically use Ollama at `http://localhost:11434`

**Ollama Notes**:
- ✅ Completely free and private
- ✅ Works offline once models are downloaded
- ✅ Supports same word count precision features
- ⚠️ Slower than OpenAI (depends on your hardware)
- ⚠️ Quality may vary compared to GPT-4
- 💻 Requires ~8GB RAM for llama3.1:8b model

### 4. Run the Application

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

The application will be available at `http://localhost:3000`.

### 5. Verify Installation

Test that everything is working:

```bash
# Test the application
npm run dev

# In another terminal, test the transcription script
echo "Testing transcription setup..."
python3 -c "import faster_whisper; print('✅ faster-whisper installed successfully')"
ffmpeg -version | head -1
yt-dlp --version
```

If all commands run without errors, you're ready to go! 🎉

### ✅ Quick Start Checklist

Here's everything you need to get running:

**System Dependencies**
- [ ] Node.js 18+ installed ([Download](https://nodejs.org/))
- [ ] Python 3.8+ installed ([Download](https://python.org/))
- [ ] FFmpeg installed (`brew install ffmpeg` or equivalent)
- [ ] yt-dlp installed (`brew install yt-dlp` or `pip install yt-dlp`)

**Project Setup**
- [ ] Repository cloned: `git clone <repo-url>`
- [ ] Node dependencies: `npm install`
- [ ] Python dependencies: `pip install -r requirements.txt`
- [ ] Environment file: `cp .env.example .env.local`
- [ ] AI Provider configured (choose one):
  - [ ] OpenAI API key added to `.env.local`
  - [ ] Ollama installed and `llama3.1:8b-instruct` model pulled

**Verification**
- [ ] Development server starts: `npm run dev`
- [ ] Can access http://localhost:3000
- [ ] Can upload a video file and generate a blog post

**Estimated Setup Time**: 10-15 minutes

## 📖 How to Use

### Basic Usage

1. **Choose Input Method**:
   - 📁 **File Upload**: Click "File" and select a video file
   - 🔗 **YouTube URL**: Click "YouTube" and paste a video URL

2. **Customize Settings**:
   - 🎚️ **Alpha Slider**: Adjust content style (0.0 = pure transcript, 1.0 = creative)
   - 📏 **Word Count**: Set target length (200-1500 words)

3. **Generate Content**:
   - Click "Generate Blog Post"
   - Watch real-time progress updates
   - Review the generated content

4. **Access Results**:
   - Generated blog posts are automatically saved to `/posts/[video-title]/`
   - Each folder contains:
     - `transcript.txt` - Raw transcript
     - `blog-post.md` - Formatted blog post
     - `metadata.json` - Processing details
   - Use the left-side drawer (📖 icon) to browse and reload saved posts

### Saved Posts Management

#### Accessing Your Posts Library
- **📖 Drawer Toggle**: Click the book icon on the left edge of the screen
- **Post Count Badge**: Shows the number of saved posts when drawer is closed
- **Keyboard Shortcut**: Press `ESC` to close the drawer
- **Auto-close**: Drawer closes automatically after loading a post

#### What Gets Saved
Each generated blog post is automatically saved to `/posts/[sanitized-video-title]/` containing:
- **`transcript.txt`**: Complete raw transcript from the video (preserved across regenerations)
- **`blog-post.md`**: Original formatted Markdown blog post with alpha value in metadata
- **`blog-post-v2.md`**: Regenerated versions (v2, v3, etc.) when using different parameters
- **`metadata.json`**: Main metadata file tracking all versions and latest settings
- **`metadata-v2.json`**: Version-specific metadata for each regeneration

**Blog Post Headers Now Include**:
```markdown
**Word Count:** 487 | **Reading Time:** 2 minutes | **Alpha:** 0.3 | **Target:** 500
```

#### Post Management Features
- **📋 Post Preview**: View title, excerpt, word count, reading time, and tags
- **📅 Chronological Sorting**: Most recent posts appear first
- **🔄 One-Click Reload**: Load any post back into the editor for further modifications
- **🔁 Regenerate Button**: When a saved post is loaded, a "Regenerate" button appears in the preview
- **⚡ Smart Regeneration**: Regenerates using current slider values (alpha & word count)
- **📚 Automatic Versioning**: Each regeneration creates a new version (v2, v3, etc.)
- **🗑️ Safe Deletion**: Delete posts with confirmation dialog
- **🔍 Quick Stats**: See word count, reading time, and transcript size at a glance
- **🏷️ Tag Display**: Preview the first few tags with overflow indicator

### Post Regeneration Workflow

#### How to Regenerate Posts

1. **Load a Saved Post**: Use the left drawer (📖 icon) to load any previously generated post
2. **Adjust Parameters**: Modify the Alpha slider or Target Word Count as desired
3. **Click Regenerate**: A "Regenerate" button appears in the blog preview when a saved post is loaded
4. **Version Creation**: The system creates a new version (e.g., `blog-post-v2.md`) with your new settings
5. **Preserve History**: All previous versions remain intact - nothing gets overwritten

#### Regeneration Use Cases

**Experiment with Creativity Levels**:
- Generate at α=0.3 (extractive) for factual content
- Regenerate at α=0.7 (creative) for more engaging flow
- Compare versions to find the perfect style

**Adjust Length Requirements**:
- Original: 500 words for social media
- Regenerate: 1200 words for comprehensive blog post
- Keep both versions for different platforms

**Fine-tune Content Style**:
- Try different alpha values to match your brand voice
- Generate multiple variations for A/B testing
- Create content for different audiences from same transcript

#### Version Management

**File Structure After Regeneration**:
```
posts/my-productivity-video/
├── transcript.txt              # Original transcript (never changes)
├── blog-post.md               # Original version (α=0.3, 500 words)
├── blog-post-v2.md            # First regeneration (α=0.7, 500 words)
├── blog-post-v3.md            # Second regeneration (α=0.7, 1200 words)
├── metadata.json              # Tracks all versions + latest info
├── metadata-v2.json           # V2-specific metadata
└── metadata-v3.json           # V3-specific metadata
```

**Version Tracking**:
- Each version includes alpha value and target word count in the blog post header
- Metadata tracks which version was generated with which parameters
- Footer notes show generation date and alpha value used
- Easy to identify which version matches your needs

### Advanced Features

#### Alpha Values Explained
- **α = 0.0**: Pure transcript with paragraph breaks
- **α = 0.1-0.2**: Heavy extractive - lots of direct quotes, preserves original structure
- **α = 0.3-0.4**: Moderate extractive - balanced quotes and paraphrasing  
- **α = 0.5-0.6**: Moderate creative - improved flow while staying factual
- **α = 0.7-0.8**: Creative - restructured with enhanced readability
- **α = 0.9-1.0**: Highly creative - optimized for blog engagement

#### Word Count Precision
Our advanced word count control system ensures **±3% accuracy**:
- **Target Allocation**: Each section gets an exact word target that sums to your total
- **Smart Prompting**: AI aims for target words, not maximum words
- **Token Limiting**: Physical limits prevent output overage
- **Global Trimming**: Final pass ensures exact target achievement
- **Content-Aware**: Adjusts section count based on target length (350 words → 3 sections, 1000 words → 5 sections)

#### Progress Tracking
The app shows detailed progress including:
- 📝 Transcription status
- 🔍 Content analysis
- 📊 Section generation (individual chapters)
- 🔗 Final assembly
- 💾 File saving

## 📁 Project Structure

```
video-to-blog-converter/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── blogify/         # Blog generation API
│   │   │   ├── posts/           # Saved posts management API
│   │   │   │   ├── route.ts     # List and delete posts
│   │   │   │   └── [id]/        # Load specific post
│   │   │   ├── save-results/    # File saving API
│   │   │   └── transcribe/      # Transcription API
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx            # Main page
│   ├── components/
│   │   ├── ui/                  # Reusable UI components
│   │   ├── AlphaSlider.tsx      # Content style control
│   │   ├── BlogPreview.tsx      # Generated content preview
│   │   └── PostsList.tsx        # Saved posts drawer component
│   └── lib/
│       ├── client.ts            # API client functions
│       ├── env.ts              # Environment validation
│       ├── rate-limit.ts       # Rate limiting logic
│       ├── secure-exec.ts      # Secure command execution
│       ├── validation.ts       # Input validation schemas
│       └── utils.ts            # Utility functions
├── scripts/
│   └── transcribe.py           # Secure Python transcription script
├── posts/                      # Generated blog posts (auto-created)
│   └── [video-title]/         # Each post gets its own folder
│       ├── transcript.txt     # Raw video transcript
│       ├── blog-post.md       # Formatted blog post
│       └── metadata.json      # Processing metadata
├── requirements.txt           # Python dependencies
├── .env.example               # Environment template
└── README.md                  # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | 🔄 Optional | - | OpenAI API key (if not set, uses Ollama) |
| `OLLAMA_BASE_URL` | ❌ No | `http://localhost:11434` | Ollama server URL |
| `NODE_ENV` | ❌ No | `development` | Environment mode |
| `DEBUG_GEN` | ❌ No | `0` | Enable debug logging |
| `MAX_FILE_SIZE` | ❌ No | `2147483648` | Max file size (2GB) |
| `ALLOWED_ORIGINS` | ❌ No | `http://localhost:3000` | CORS origins |

### Rate Limits

- **Transcription**: 5 requests per hour per IP
- **Blog Generation**: 10 requests per hour per IP

These limits help prevent abuse while allowing reasonable usage.

## 🛠️ Development

### Running Tests

```bash
# Lint code
npm run lint

# Build project
npm run build

# Type checking
npm run build
```

### Code Quality

This project uses:
- **TypeScript** for type safety
- **ESLint** for code linting
- **Zod** for runtime validation
- **Tailwind CSS** for styling

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 🔒 Security Features

### Input Validation
- ✅ File type and size validation
- ✅ URL format validation
- ✅ Request body schema validation
- ✅ Path traversal prevention

### Command Injection Protection
- ✅ Secure command execution using `spawn()`
- ✅ Input sanitization and validation
- ✅ Separate Python script for transcription
- ✅ Path validation and restriction

### Rate Limiting
- ✅ IP-based request limiting
- ✅ Configurable time windows
- ✅ Proper HTTP status codes
- ✅ Graceful error messages

## ⚡ Performance

### Optimizations
- **Streaming Progress**: Real-time updates during processing
- **Chunked Processing**: Handles large transcripts efficiently  
- **Smart Section Allocation**: Content-driven section planning
- **Precise Token Management**: Per-section token limits prevent waste
- **Memory Management**: Efficient file handling
- **Caching**: Static asset optimization

### Word Count Accuracy
- **Target Allocation**: Sections allocated exact word targets summing to global target
- **Prompt Engineering**: LLM instructions focus on target, not maximum words
- **Multi-layer Validation**: Section-level and global-level word count enforcement
- **Sentence-boundary Trimming**: Clean cuts that preserve readability

### Scalability
- **Rate Limiting**: Prevents system overload
- **Error Handling**: Graceful failure recovery
- **Resource Management**: Automatic cleanup of temporary files
- **Content-driven Scaling**: Automatically adjusts complexity based on target length

## 🐛 Troubleshooting

### Common Issues

#### "faster-whisper not installed"
```bash
pip install faster-whisper
```

#### "FFmpeg not found"
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

#### "yt-dlp not found"
```bash
# macOS
brew install yt-dlp

# Ubuntu/Debian
pip install yt-dlp
```

#### "OpenAI API error"
- Verify your API key in `.env.local`
- Check your OpenAI account has available credits
- Ensure the API key has proper permissions
- Make sure you're using a valid GPT-4 compatible key

#### Rate limit exceeded
- Wait for the reset time shown in the error
- Consider upgrading your OpenAI plan for higher limits

#### Word count not accurate
- Enable debug mode: set `DEBUG_GEN=1` in `.env.local`
- Check console output for section-by-section word counts
- For very short targets (<300 words), some variance is normal
- For consistent issues, verify your OpenAI model has latest updates
- Try different alpha values - higher alpha (0.7+) often produces more accurate counts

#### Ollama connection issues
- Verify Ollama is running: `ollama list`
- Check if the server is accessible: `curl http://localhost:11434/api/tags`
- Ensure `llama3.1:8b-instruct` model is installed: `ollama pull llama3.1:8b-instruct`
- For custom Ollama URLs, set `OLLAMA_BASE_URL` in `.env.local`

#### Ollama generation is slow/poor quality
- Try a larger model: `ollama pull llama3.1:70b-instruct` (requires 40GB+ RAM)
- Experiment with different models: `ollama pull qwen2.5:14b-instruct`
- Increase alpha values (0.6-0.8) for better structured output
- Consider switching to OpenAI for production use

### Debug Mode

Enable debug logging by setting `DEBUG_GEN=1` in your `.env.local`:

```env
DEBUG_GEN=1
```

This will show detailed processing steps in the console.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenAI** for GPT-4 and Whisper APIs
- **Vercel** for Next.js framework
- **Radix UI** for accessible components
- **Tailwind CSS** for utility-first styling

## 📞 Support

- 🐛 **Bug Reports**: [Create an issue](https://github.com/yourusername/video-to-blog-converter/issues)
- 💡 **Feature Requests**: [Start a discussion](https://github.com/yourusername/video-to-blog-converter/discussions)
- 📧 **Questions**: Check existing issues or start a new discussion

---

**Made with ❤️ for content creators, educators, and anyone who wants to transform their videos into engaging blog content.**
