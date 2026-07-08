/**
 * copyImagesOnlySimple.js
 * ========================
 * Copies performance preview images from Python folder to backend/public/performance_previews/
 * WITHOUT registering them in the database (charts table doesn't exist yet).
 *
 * Usage:
 *   node scripts/copyImagesOnlySimple.js
 *
 * Prerequisites:
 *   Source images must exist in orca-efb-v14-main/static/performance_previews
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function copyImages() {
  console.log('\nOrca EFB — Performance Preview Image Copy')
  console.log('────────────────────────────────────────────')
  
  const sourcePath = path.join(
    __dirname,
    '../../orca-efb-v14-main/orca-efb-v14-main/static/performance_previews'
  )
  
  const destPath = path.join(__dirname, '../public/performance_previews')
  
  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    console.error(`\n❌ Source directory not found: ${sourcePath}`)
    process.exit(1)
  }
  
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destPath)) {
    console.log(`\n📁 Creating destination directory: ${destPath}`)
    fs.mkdirSync(destPath, { recursive: true })
  }
  
  // Copy all images
  const files = fs.readdirSync(sourcePath)
  let copied = 0
  
  console.log(`\n📂 Source: ${sourcePath}`)
  console.log(`📂 Destination: ${destPath}\n`)
  
  for (const file of files) {
    if (file.endsWith('.jpg') || file.endsWith('.png')) {
      const src = path.join(sourcePath, file)
      const dest = path.join(destPath, file)
      fs.copyFileSync(src, dest)
      console.log(`   ✓ Copied: ${file}`)
      copied++
    }
  }
  
  console.log(`\n✅ Successfully copied ${copied} performance preview images`)
  console.log(`   No database registration (charts table doesn't exist yet)\n`)
}

copyImages().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
