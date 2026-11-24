// The businesses that have a static chat. A business is the key of its content and the sites allowed to ask for it.
// A new business is one line here (and its page file in apps/chatbot/public/businesses/).
export interface Business { key: string; origins: string[] }

export const BUSINESSES: Record<string, Business> = {
  harpatka: { key: 'harpatka', origins: ['https://harpatka.co.il', 'https://www.harpatka.co.il', 'https://test.harpatka.co.il', 'https://floa.co.il', 'https://chatbot.floa.co.il'] },
};
