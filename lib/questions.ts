/**
 * The daily question rotates through this list (one per day, in order).
 *
 * `groups` is optional. Each entry maps a group name to keywords/phrases that
 * should always land in that group. Keyword matching runs before the AI, is
 * free and instant, and the group names are also offered to the AI as
 * preferred buckets, so it's worth seeding the obvious ones.
 *
 * Tip: always give a question a stable `id`. Answers are stored per day + id,
 * so editing the prompt text later won't mix up results.
 */
export type Question = {
  id: string;
  prompt: string;
  groups?: Record<string, string[]>;
};

export const QUESTIONS: Question[] = [
  {
    id: "forget-to-pack",
    prompt: "Name something passengers always forget to pack",
    groups: {
      Clothes: ["clothes", "clothing", "shirt", "pants", "underwear", "socks", "jacket", "sweater", "dress", "skirt", "shorts", "pajamas", "outfit", "leggings", "bra", "hat"],
      "Phone charger": ["charger", "phone charger", "charging cable", "cord", "cable", "power bank", "adapter"],
      Toiletries: ["toiletries", "toothbrush", "toothpaste", "deodorant", "shampoo", "razor", "floss", "hairbrush", "comb", "makeup", "face wash", "soap", "lotion", "contact solution"],
      Medication: ["medication", "medicine", "meds", "pills", "prescription", "inhaler", "vitamins", "advil", "tylenol", "ibuprofen", "aspirin", "motrin", "pain reliever", "allergy medicine"],
      "Passport / ID": ["passport", "id", "license", "drivers license", "identification", "visa"],
      Sunscreen: ["sunscreen", "sunblock", "spf"],
      Swimsuit: ["swimsuit", "bathing suit", "swim trunks", "bikini", "swimwear"],
      Sunglasses: ["sunglasses", "shades"],
      "Reading material": ["book", "books", "magazine", "kindle", "e reader", "reader's digest", "readers digest", "novel"],
      Shoes: ["shoes", "sandals", "flip flops", "sneakers", "boots"],
    },
  },
  {
    id: "flight-complaints",
    prompt: "Name something passengers complain about on a flight",
    groups: {
      "Seat / legroom": ["legroom", "leg room", "seat", "small seats", "cramped", "recline", "middle seat"],
      Food: ["food", "snacks", "meal", "no food"],
      "Crying babies": ["baby", "babies", "crying baby", "kids", "children"],
      Delays: ["delay", "delays", "late", "delayed"],
      Temperature: ["cold", "hot", "temperature", "freezing"],
      Turbulence: ["turbulence", "bumpy"],
      "Wi-Fi": ["wifi", "wi fi", "internet"],
    },
  },
  {
    id: "airport-pass-time",
    prompt: "Name something people do to pass the time at the airport",
    groups: {
      "Eat / drink": ["eat", "food", "drink", "coffee", "bar", "restaurant", "snack"],
      "On their phone": ["phone", "scroll", "social media", "texting", "games on phone"],
      Shopping: ["shop", "shopping", "duty free", "stores"],
      Read: ["read", "book", "magazine"],
      Sleep: ["sleep", "nap"],
    },
  },
  { id: "reason-to-change", prompt: "Name a reason a passenger calls to change their trip" },
  { id: "feels-like-vacation", prompt: "Name something that makes a trip feel like a real vacation" },
  { id: "lost-at-airport", prompt: "Name something a passenger might lose at the airport" },
  { id: "honeymoon-spot", prompt: "Name a popular honeymoon destination" },
  { id: "ask-for-extra", prompt: "Name something passengers always ask for extra of" },
  { id: "hotel-must-have", prompt: "Name something travelers expect every hotel room to have" },
  { id: "first-thing-landed", prompt: "Name the first thing people do after their plane lands" },
];
