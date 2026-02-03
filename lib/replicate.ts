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
    // We use predictions.create + wait to ensure we get a URL instead of a ReadableStream
    const prediction = await replicate.predictions.create({
      version: "c846a69991daf4c0e5d016514849d14ee5b2e6846ce6b9d6f21369e564cfe51e", // flux-schnell latest
      input: {
        prompt: prompt,
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
