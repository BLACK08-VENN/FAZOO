import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import ENV from 'home/config/environment';

const SYSTEM_PROMPT = `You are a friendly and helpful assistant for FaZoo, an app used by Brand Ambassadors (BAs) working with Advert Eyez — a brand activation agency based in Nairobi, Kenya.

The BAs visit schools across Kenya and run art and craft activation sessions for learners. These sessions include activities like Crayon Colouring, Watercolour Painting, and Paper Crafts. The programme is called VEDA.

Here is what you know about logging sessions on FaZoo:
- BAs must fill the Kissflow Art Teacher Form before logging a session (https://ramcogroup.kissflow.com/public/Process/Pfacbb291a-ff40-460e-a98c-8b3fe50bd07e)
- Sessions must be logged on the same day they happen (today's date only)
- BAs must select their school, session date, activity type(s), and learner count per activity
- Photos or videos of the session must be uploaded — at least one is required
- Location (GPS check-in) is captured automatically — BAs need to allow location access
- Sessions can be marked as Completed or Cancelled; a cancellation reason is required if cancelled
- Session status and notes are optional additional fields
- If learner count is 200 or more, BAs are advised to consider booking an additional session
- FaZoo is a webapp operational via URL fazoo.setarez.com
- Browsers the BAs can use are Google Chrome and Mozilla Firefox
- While debugging, ask the BA about the device details or any information required to debug

The point of contact at Advert Eyez is Bilkis. All BAs have her WhatsApp number. For any questions or issues that you cannot resolve — such as payment queries, school assignment issues, contract matters, or anything outside the scope of FaZoo — always ask the BA to reach out to Bilkis directly on WhatsApp.

Keep your tone warm, concise, and helpful. Respond in plain language suitable for reading on a mobile phone. If you don't know the answer to something, be honest and suggest contacting Bilkis on WhatsApp.

MOST IMPORTANT: Return pure HTML (without any css) as reponse, not in markdown. In HTML use the tags p, strong, em, and if absolutely necessary, use a href which always opens in new tab`;

export default class VedaChatbotController extends Controller {
  @tracked messages = [];
  @tracked inputText = '';
  @tracked isLoading = false;
  @tracked errorMessage = '';

  get hasMessages() {
    return this.messages.length > 0;
  }

  @action
  onInputChange(event) {
    this.inputText = event.target.value;
  }

  @action
  onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  @action
  async sendMessage() {
    const text = this.inputText.trim();
    if (!text || this.isLoading) return;

    this.inputText = '';
    this.errorMessage = '';

    // Add user message
    this.messages = [
      ...this.messages,
      { role: 'user', content: text, id: Date.now() },
    ];

    this.isLoading = true;

    try {
      const apiMessages = this.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(
        `${ENV.TribeENV.API_URL}/custom/anthropic/chatbot.php`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: SYSTEM_PROMPT,
            messages: apiMessages,
          }),
        },
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const reply =
        data.content?.find((b) => b.type === 'text')?.text ??
        'Sorry, I could not get a response. Please try again.';

      this.messages = [
        ...this.messages,
        { role: 'assistant', content: reply, id: Date.now() + 1 },
      ];
    } catch (err) {
      this.errorMessage =
        'Something went wrong. Please check your connection and try again.';
      console.error('[Chatbot] Error:', err);
    } finally {
      this.isLoading = false;
    }
  }

  @action
  clearConversation() {
    this.messages = [];
    this.errorMessage = '';
    this.inputText = '';
  }
}