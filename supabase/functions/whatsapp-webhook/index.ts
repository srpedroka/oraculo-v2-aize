import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleWhatsAppWebhook } from "../_shared/whatsapp-processor.ts";

serve(handleWhatsAppWebhook);
