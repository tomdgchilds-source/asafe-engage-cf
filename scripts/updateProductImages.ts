import { neon } from "@neondatabase/serverless";

/**
 * Updates product image URLs in the database to match the current
 * A-SAFE website CDN URLs (verified accessible as of April 2026).
 *
 * Run with:
 *   DATABASE_URL="..." npx tsx scripts/updateProductImages.ts
 */

const IMAGE_URL_MAP: Record<string, string> = {
  "Alarm Bar":
    "https://webcdn.asafe.com/media/4871/alarmbar_qtr.jpg",
  "Atlas Double Traffic Barrier":
    "https://webcdn.asafe.com/media/2948/atlas-double-traffic-barrier_qu.jpg",
  "Atlas Double Traffic Barrier+":
    "https://webcdn.asafe.com/media/2947/atlas-double-trafficplus-barrier_qu.jpg",
  "Bollard, Grey":
    "https://webcdn.asafe.com/media/5621/iflexbollard_190_1200_front277x130.jpg",
  "Bollard, Yellow":
    "https://webcdn.asafe.com/media/5621/iflexbollard_190_1200_front277x130.jpg",
  "Car Stop":
    "https://webcdn.asafe.com/media/9762/carstop4_front_277x130.jpg",
  "Coach Stop":
    "https://webcdn.asafe.com/media/9772/coachstop_front_277x130.jpg",
  "Dock Buffer (Pair)":
    "https://webcdn.asafe.com/media/9796/dockbuffer_front_277x130.jpg",
  "FlexiShield Column Guard":
    "https://webcdn.asafe.com/media/2956/flexishield-column-guard-wraparound-_qu.jpg",
  "FlexiShield Column Guard Spacer Set":
    "https://webcdn.asafe.com/media/2956/flexishield-column-guard-wraparound-_qu.jpg",
  "FlexiShield Corner Guard":
    "https://webcdn.asafe.com/media/5353/flexishieldcornerguard_qtr1156x556.jpg",
  "ForkGuard Kerb Barrier":
    "https://webcdn.asafe.com/media/0lkhom3p/forkguard_qutr1.jpg",
  "HD ForkGuard Kerb Barrier":
    "https://webcdn.asafe.com/media/2hljhqtr/forkguard_insitu_1.jpg",
  "Heavy Duty Bollard, Grey, GALV":
    "https://webcdn.asafe.com/media/6092/iflexheavydutybollard__front277x130.jpg",
  "Heavy Duty Bollard, Yellow, GALV":
    "https://webcdn.asafe.com/media/6092/iflexheavydutybollard__front277x130.jpg",
  "Hydraulic Swing Gate, Self-Close":
    "https://webcdn.asafe.com/media/2974/iflex-swinggate_short_qu.jpg",
  "Monoplex Bollard":
    "https://webcdn.asafe.com/media/lthn25rg/190_monoplex_bollard_product_image-7-min.jpg",
  "Slider Plate":
    "https://webcdn.asafe.com/media/3580/sliderplates_158_front.jpg",
  "Step Guard":
    "https://webcdn.asafe.com/media/11977/product_image_2_qutr_578x278.jpg",
  "Traffic Gate":
    "https://webcdn.asafe.com/media/wl1debok/traffic_gate_2_1156x556.jpg",
  "Truck Stop":
    "https://webcdn.asafe.com/media/9766/truckstop_front_277x130.jpg",
  "eFlex Double Rack End Barrier":
    "https://webcdn.asafe.com/media/2981/reflex_doublerailrackendbarrier_qu.jpg",
  "eFlex Single Rack End Barrier":
    "https://webcdn.asafe.com/media/2984/reflex_singlerailrackendbarrier_qu.jpg",
  "eFlex Single Traffic Barrier":
    "https://webcdn.asafe.com/media/2990/reflex-single-traffic-barrier_qu.jpg",
  "eFlex Single Traffic Barrier+":
    "https://webcdn.asafe.com/media/2989/reflex-single-traffic-plus-barrier_qu.jpg",
  "iFlex Double Traffic Barrier":
    "https://webcdn.asafe.com/media/4751/iflex-double-traffic-barrier_qu.jpg",
  "iFlex Double Traffic Barrier+":
    "https://webcdn.asafe.com/media/2957/iflex-double-trafficplus-barrier_qu.jpg",
  "iFlex RackGuard":
    "https://webcdn.asafe.com/media/3567/rackguard-rack-leg-protector_front.jpg",
  "iFlex Single Traffic Barrier":
    "https://webcdn.asafe.com/media/2970/iflex-single-traffic-barrier_qu.jpg",
  "iFlex Single Traffic Barrier+":
    "https://webcdn.asafe.com/media/2969/iflex-single-trafficplus-barrier_qu.jpg",
  "iFlex Height Restrictor":
    "https://webcdn.asafe.com/media/5679/iflexheightrestrictsitu1156x556_03.jpg",
  "mFlex Double Traffic Barrier":
    "https://webcdn.asafe.com/media/2975/mflex-double-traffic-barrier-micro-_qu.jpg",
  "mFlex Single Traffic Barrier":
    "https://webcdn.asafe.com/media/2976/mflex-single-traffic-barrier-micro-_qu.jpg",
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log(`Updating image URLs for ${Object.keys(IMAGE_URL_MAP).length} products...\n`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const [productName, imageUrl] of Object.entries(IMAGE_URL_MAP)) {
    try {
      const result = await sql`
        UPDATE products
        SET image_url = ${imageUrl}
        WHERE name = ${productName}
        RETURNING id, name
      `;

      if (result.length > 0) {
        console.log(`  Updated: ${result[0].name}`);
        updated++;
      } else {
        console.log(`  Not found in DB: "${productName}"`);
        notFound++;
      }
    } catch (err: any) {
      console.error(`  Error updating "${productName}": ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone! Updated: ${updated}, Not found: ${notFound}, Errors: ${errors}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
