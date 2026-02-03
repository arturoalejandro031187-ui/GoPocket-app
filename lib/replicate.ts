import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export interface GenerateBannerOptions {
  prompt: string;
  aspectRatio?: "16:9" | "1:1" | "21:9" | "3:2" | "4:5" | "9:16";
}

/**
 * Generates a banner image using Replicate (Flux Schnell model).
 * @param options Configuration for the image generation
 * @returns The URL of the generated image
 */
export async function generateBanner({ prompt, aspectRatio = "16:9" }: GenerateBannerOptions) {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not set in environment variables");
  }

  console.log("🎨 Generating banner with prompt:", prompt);

  try {
    // Using Flux Dev for better quality, especially on faces
    // We use predictions.create + wait to ensure we get a URL instead of a ReadableStream
    const prediction = await replicate.predictions.create({
      version: "6e4a938f85952bdabcc15aa329178c4d681c52bf25a0342403287dc26944661d", // flux-dev latest
      input: {
        prompt: prompt + ", highly detailed faces, sharp focus, 8k, photorealistic, beautiful composition, perfect eyes",
        aspect_ratio: aspectRatio,
        output_format: "webp",
        output_quality: 90,
        disable_safety_checker: false
      }
    });

    const output = await replicate.wait(prediction);

    console.log("✅ Banner generated successfully");
    // output.output is typically [ "https://..." ]
    return output.output;
  } catch (error) {
    console.error("❌ Error generating banner:", error);
    throw error;
  }
}

export default replicate;
