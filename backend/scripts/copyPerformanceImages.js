/**
 * copyPerformanceImages.js
 * ========================
 * Copies performance preview images from Python folder to backend/public/performance_previews/
 * and registers them in the charts table.
 *
 * Usage:
 *   node scripts/copyPerformanceImages.js
 *
 * Prerequisites:
 *   1. Database must be running with charts table
 *   2. Aircraft records must exist in database
 *   3. Source images must exist in orca-efb-v14-main/static/performance_previews
 */

import 'dotenv/config'
import { copyPerformancePreviewImages } from '../src/modules/charts/charts.service.js'

async function main() {
  console.log('\nOrca EFB — Performance Preview Image Copy')
  console.log('────────────────────────────────────────────')
  
  try {
    const result = await copyPerformancePreviewImages()
    console.log(`\n✅ ${result.message}`)
    console.log(`   Total images copied: ${result.copied}`)
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`)
    if (err.code === 'ENOENT') {
      console.error('   Source directory not found. Check paths in charts.service.js')
    }
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
