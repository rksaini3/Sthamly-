// हर AI provider इसी interface को लागू करेगा।
// Provider बदलना या fallback जोड़ना सिर्फ इन्हीं फाइलों में होगा।

export interface AIResult {
  url?: string;
  text?: string;
  costPaise: number;
}

export interface ImageRequest {
  prompt: string;
  size: "1:1" | "4:5";
}

export interface VideoRequest {
  prompt: string;
  seconds: number;
  aspect: "9:16";
}

export interface TextRequest {
  prompt: string;
  maxTokens?: number;
}

export interface AIProvider {
  readonly name: string;
  generateImage(req: ImageRequest): Promise<AIResult>;
  generateVideo(req: VideoRequest): Promise<AIResult>;
  generateText(req: TextRequest): Promise<AIResult>;
}