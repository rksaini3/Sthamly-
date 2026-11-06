// WhatsApp Cloud API payload के type (सिर्फ जो हम इस्तेमाल करेंगे)
// TODO (Phase 1): zod schema से runtime validation भी जोड़ें।

export interface WhatsAppInbound {
  object: "whatsapp_business_account";
  entry: {
    id: string;
    changes: {
      field: "messages";
      value: {
        messaging_product: "whatsapp";
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: WhatsAppMessage[];
      };
    }[];
  }[];
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "audio" | "button" | "interactive" | string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string; voice?: boolean };
}