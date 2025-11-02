/**
 * Test posting a reply to YouTube
 */

async function testPostReply() {
  // Get a comment with PENDING draft
  const comment = await fetch("http://localhost:3001/api/comments/grouped")
    .then(res => res.json())
    .then(groups => {
      for (const group of groups) {
        for (const comment of group.comments) {
          if (comment.draft?.status === "PENDING") {
            return comment;
          }
        }
      }
      return null;
    });

  if (!comment) {
    console.log("❌ No PENDING comments found");
    return;
  }

  console.log(`\n🧪 Testing POST reply for comment: ${comment.id}`);
  console.log(`   Draft ID: ${comment.draft.id}`);
  console.log(`   Reply: ${comment.draft.reply?.substring(0, 50)}...`);
  console.log("");

  try {
    const response = await fetch(`http://localhost:3001/api/comments/${comment.id}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Note: This won't work without proper session cookie
      },
    });

    const data = await response.json();

    console.log(`\n📊 Response Status: ${response.status}`);
    console.log(`📄 Response Data:`, JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.log(`\n❌ Error: ${data.error}`);
      if (data.details) {
        console.log(`📋 Details:`, data.details);
      }
    } else {
      console.log(`\n✅ Success!`);
    }

  } catch (error) {
    console.error("\n❌ Request failed:", error);
  }
}

testPostReply();
