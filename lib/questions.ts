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
    id: "seatbelt-sign-off",
    prompt: "Name something passengers do as soon as the seatbelt sign turns off",
    groups: {
      "Go to the bathroom": ["bathroom", "restroom", "lavatory", "lav", "toilet", "pee", "use the bathroom"],
      "Stand up": ["stand", "stand up", "get up", "stretch", "stretch legs", "get out of seat"],
      "Grab their bags": ["grab bag", "grab bags", "overhead bin", "carry on", "luggage", "get bags", "open overhead"],
      "Turn on phone": ["phone", "turn on phone", "check phone", "text", "call", "airplane mode"],
      "Unbuckle": ["unbuckle", "take off seatbelt", "seatbelt", "unbuckle seatbelt"],
      "Recline seat": ["recline", "lean back", "put seat back"],
      "Crowd the aisle": ["line up", "rush", "rush to door", "crowd aisle", "aisle", "push"],
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
  {
    id: "reason-to-change",
    prompt: "Name a reason a passenger calls to change their trip",
    groups: {
      Illness: ["sick", "medical emergency", "illness", "ill", "covid", "flu", "medical", "doctor", "hospital", "surgery", "injury", "health"],
      "Family emergency": ["family emergency", "emergency", "death", "death in family", "funeral", "passed away", "bereavement"],
      Work: ["work", "job", "work conflict", "work trip", "boss", "meeting", "business"],
      Weather: ["weather", "storm", "hurricane", "snow", "blizzard"],
      "Change of plans": ["change of plans", "plans changed", "schedule change", "schedule conflict", "conflict", "change dates", "new dates", "date change"],
      "Flight delay or cancellation": ["delay", "delayed", "cancel", "cancelled", "canceled", "cancellation", "flight cancelled", "missed connection"],
      "Cheaper price": ["cheaper", "cheaper flight", "price drop", "better price", "lower fare", "price", "money"],
      "Booking mistake": ["wrong date", "wrong dates", "mistake", "booked wrong", "wrong name", "name change", "typo", "wrong flight", "wrong airport"],
      Pregnancy: ["pregnant", "pregnancy", "baby", "having a baby"],
    },
  },
  {
    id: "feels-like-vacation",
    prompt: "Name something that makes a trip feel like a real vacation",
    groups: {
      "No work": ["no work", "not working", "off work", "time off", "pto", "out of office", "no emails", "no email", "unplugging", "unplug", "no meetings"],
      "Good weather": ["good weather", "warm weather", "nice weather", "hot weather", "sunny weather", "warmth", "warm", "weather", "heat"],
      Sun: ["sun", "sunshine", "sunny"],
      Beach: ["beach", "ocean", "sand", "the beach", "beaches", "sea"],
      Hotel: ["hotel", "nice hotel", "room service", "hotel room"],
      Resort: ["resort", "all inclusive", "all-inclusive"],
      Pool: ["pool", "swimming pool", "pool side", "poolside", "swim"],
      "Good food": ["food", "good food", "eating out", "restaurant", "restaurants", "dining", "seafood", "eating", "great food"],
      Drinks: ["drinks", "drink", "cocktails", "cocktail", "margarita", "margaritas", "alcohol", "wine", "beer", "booze", "drinking", "mai tai"],
      Family: ["family", "family time", "time with family", "with family", "loved ones"],
      "No kids": ["no kids", "no children", "kid free", "kid-free", "without kids", "away from kids", "adults only"],
      Relaxing: ["relax", "relaxing", "relaxation", "rest", "resting", "sleep in", "sleeping in", "no alarm", "nap", "naps", "lounging"],
      Spa: ["spa", "massage", "spa day", "massages"],
      Sightseeing: ["sightseeing", "tour", "tours", "exploring", "explore", "adventure", "excursion", "excursions"],
      "No cooking": ["no cooking", "not cooking", "no cleaning", "no chores", "no dishes"],
    },
  },
  {
    id: "lost-at-airport",
    prompt: "Name something a passenger might lose at the airport",
    groups: {
      Phone: ["phone", "cell phone", "cellphone", "iphone", "mobile"],
      Wallet: ["wallet", "purse", "money", "cash", "credit card"],
      "Passport / ID": ["passport", "id", "license", "drivers license", "identification"],
      "Boarding pass": ["boarding pass", "ticket", "tickets", "boarding passes"],
      Luggage: ["luggage", "suitcase", "bag", "bags", "carry on", "checked bag", "baggage", "backpack"],
      Keys: ["keys", "key", "car keys", "house keys"],
      Kids: ["kid", "kids", "child", "children", "their kid", "toddler"],
      Headphones: ["headphones", "airpods", "earbuds", "ear buds", "air pods"],
      Jacket: ["jacket", "coat", "sweater", "hoodie", "sweatshirt"],
      Charger: ["charger", "phone charger", "cord", "charging cable"],
      Glasses: ["glasses", "sunglasses", "reading glasses"],
      "Their patience": ["patience", "mind", "sanity", "temper", "cool", "their mind"],
      "Their way": ["way", "their way", "directions", "gate", "their gate", "lost", "bearings"],
      Laptop: ["laptop", "computer", "ipad", "tablet"],
    },
  },
  {
    id: "sun-country-memorized",
    prompt: "Name something a Sun Country employee might have memorized",
    groups: {
      "Airport codes": ["airport code", "airport codes", "msp", "three letter code", "3 letter code", "city code", "iata code"],
      "Phonetic alphabet": ["phonetic alphabet", "nato alphabet", "alpha bravo", "alpha bravo charlie", "phonetic"],
      "Flight numbers": ["flight number", "flight numbers", "flight schedule"],
      "Bag policy": ["bag policy", "baggage policy", "bag fee", "bag fees", "baggage fee", "carry on size", "bag size", "bag dimension", "personal item size"],
      "Confirmation codes": ["confirmation code", "confirmation number", "record locator", "pnr", "reservation number"],
      "Destinations": ["destination", "destinations", "route", "routes", "cities we fly to", "where we fly"],
      "Phone number": ["phone number", "customer service number", "call center number"],
      "Employee ID": ["employee id", "employee number", "badge number", "pin"],
      "Safety demo": ["safety demo", "safety announcement", "safety briefing", "safety speech"],
      "Policies": ["policy", "policies", "change policy", "cancellation policy", "refund policy", "pet policy"],
    },
  },
  { id: "ask-for-extra", prompt: "Name something passengers always ask for extra of" },
  { id: "hotel-must-have", prompt: "Name something travelers expect every hotel room to have" },
  { id: "first-thing-landed", prompt: "Name the first thing people do after their plane lands" },
  // Spares (not used during the event week)
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
  { id: "honeymoon-spot", prompt: "Name a popular honeymoon destination" },
];
