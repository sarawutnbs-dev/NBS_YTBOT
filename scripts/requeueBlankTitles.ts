import { config } from "dotenv";
import { resolve } from "path";
import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { ensureVideoIndexFor } from "@/lib/transcriptQueue";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const blankVideos = await prisma.videoIndex.findMany({
    where: {
      title: ""
    },
    select: { videoId: true }
  });

  if (blankVideos.length === 0) {
    console.log("No blank titles found.");
    return;
  }

  console.log(`Found ${blankVideos.length} video(s) with blank title. Resetting status to NONE and re-queuing...`);

  const videoIds = blankVideos.map((video) => video.videoId);

  await prisma.videoIndex.updateMany({
    where: { videoId: { in: videoIds } },
    data: { status: IndexStatus.NONE }
  });

  await ensureVideoIndexFor(new Set(videoIds));

  console.log("Re-queued videos for indexing.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
