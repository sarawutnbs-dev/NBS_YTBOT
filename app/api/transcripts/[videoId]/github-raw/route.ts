import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  try {
    const { videoId } = params;
    const year = new Date().getFullYear();
    const githubUrl = `https://raw.githubusercontent.com/sarawutnbs-dev/youtube-transcript/main/${year}/${videoId}.txt`;

    const response = await fetch(githubUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: "Transcript not found on GitHub" },
        { status: 404 }
      );
    }

    const text = await response.text();

    return NextResponse.json({
      videoId,
      source: "github",
      year,
      url: githubUrl,
      content: text,
    });
  } catch (error) {
    console.error("Error fetching GitHub transcript:", error);
    return NextResponse.json(
      { error: "Failed to fetch transcript from GitHub" },
      { status: 500 }
    );
  }
}
