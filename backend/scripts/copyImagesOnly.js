/**
 * copyImagesOnly.js
 * =================
 * Simple script to copy performance preview images from Python folder to backend/public/performance_previews/
 * Does NOT register images in database (that's a separate task)
 *
 * Usage:
 *   node scripts/copyImagesOnly.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Source: Python prototype static folder
const sourcePath = path.join(
  __dirname,
  '../../orca-efb-v14-main/orca-efb-v14-main/static/performance_previews'
)

// Destination: Node.js backend public folder
const destPath = path.join(__dirname, '../public/performance_previews')

async function main() {
  console.log('\nOrca EFB — Copy Performance Preview Images')
  console.log('──────────────────────────────────────────────')
  console.log(`Source:      ${sourcePath}`)
  console.log(`Destination: ${destPath}`)
  
  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    console.error(`\n❌ Error: Source directory not found`)
    console.error(`   Path: ${sourcePath}`)
    process.exit(1)
  }
  
  // Create destination directory
  if (!fs.existsSync(destPath)) {
    console.log('\n📁 Creating destination directory...')
    fs.mkdirSync(destPath, { recursive: true })
  }
  
  // Read files from source
  const files = fs.readdirSync(sourcePath)
  const imageFiles = files.filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
  
  console.log(`\n📋 Found ${imageFiles.length} image files to copy`)
  
  // Copy each image
  let copied = 0
  for (const file of imageFiles) {
    const src = path.join(sourcePath, file)
    const dest = path.join(destPath, file)
    
    try {
      fs.copyFileSync(src, dest)
      console.log(`   ✓ ${file}`)
      copied++
    } catch (err) {
      console.error(`   ✗ ${file} - ${err.message}`)
    }
  }
  
  console.log(`\n✅ Successfully copied ${copied} image files`)
  console.log(`   Location: ${destPath}\n`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
