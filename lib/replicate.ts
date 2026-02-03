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
    // Using Flux Schnell for fast, high-quality results
    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: prompt,
          aspect_ratio: aspectRatio,
          output_format: "webp",
          output_quality: 90,
          disable_safety_checker: false
        }
      }
    );

    // Output is usually an array of streams or URLs. For Flux it's usually a ReadableStream or URL string array.
    // Replicate Node SDK returns the output directly.
    console.log("✅ Banner generated successfully");
    return output;
  } catch (error) {
    console.error("❌ Error generating banner:", error);
    throw error;
  }
}

export default replicate;
