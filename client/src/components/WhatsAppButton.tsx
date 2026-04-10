import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WhatsAppButton() {
  const whatsappUrl = "https://wa.me/971503881285";

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        asChild
        className="bg-green-500 hover:bg-green-600 text-white rounded-full w-14 h-14 shadow-lg transition-all duration-300 hover:scale-110"
        data-testid="whatsapp-button"
      >
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="h-6 w-6" />
        </a>
      </Button>
    </div>
  );
}
