import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getTranscriptFromGitHub } = await import("../lib/transcript");

  console.log("\n=== Testing Year Detection for GitHub Transcript ===\n");

  // Test 1: ไม่มี publishedAt (ใช้ปีปัจจุบัน)
  console.log("Test 1: Without publishedAt (should use 2025)");
  await getTranscriptFromGitHub("PiZaIXJ2iPs");

  console.log("\n---\n");

  // Test 2: มี publishedAt ปี 2025
  console.log("Test 2: With publishedAt = 2025-10-27 (should use 2025)");
  await getTranscriptFromGitHub("PiZaIXJ2iPs", "2025-10-27T11:00:58.000Z");

  console.log("\n---\n");

  // Test 3: มี publishedAt ปี 2024
  console.log("Test 3: With publishedAt = 2024-12-15 (should use 2024)");
  await getTranscriptFromGitHub("test-video-2024", "2024-12-15T10:00:00.000Z");

  console.log("\n---\n");

  // Test 4: มี publishedAt ปี 2023
  console.log("Test 4: With publishedAt = 2023-06-01 (should use 2023)");
  await getTranscriptFromGitHub("test-video-2023", "2023-06-01T08:30:00.000Z");

  console.log("\n=== Test Complete ===");
}

main();
