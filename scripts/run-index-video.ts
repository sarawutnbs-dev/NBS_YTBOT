import { indexVideo } from "../jobs/indexVideo";

const videoId = process.argv[2] || "iyR0Bb3Vjnk";

console.log(`[Script] Running indexVideo for: ${videoId}`);

indexVideo({ videoId })
  .then((result) => {
    console.log(`[Script] Success! Result:`, result);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`[Script] Error:`, error);
    process.exit(1);
  });
