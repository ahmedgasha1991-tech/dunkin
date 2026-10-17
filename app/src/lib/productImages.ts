// Curated, fast-loading, high-resolution product images for Dunkin' catalog
import { PRODUCT_UPLOADED_IMAGES, getUploadedProductImage } from "../data/productImagesMapping";

export { PRODUCT_UPLOADED_IMAGES, getUploadedProductImage };

export const DEFAULT_DUNKIN_IMAGE =
  "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80";

export const CATEGORY_IMAGES: Record<string, string> = {
  "أكواب ساخنة":
    "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=400&q=80",
  "الأكواب الباردة":
    "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=400&q=80",
  "أغطية الأكواب":
    "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=400&q=80",
  "أغلفة وحوامل الأكواب":
    "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?auto=format&fit=crop&w=400&q=80",
  "الصناديق والعلب":
    "https://images.unsplash.com/photo-1525607551316-4a8e16d1f9ba?auto=format&fit=crop&w=400&q=80",
  "أكياس التعبئة والتسوق":
    "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80",
  "قهوة وكبسولات":
    "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80",
  "الشرابات والصلصات والبودرة":
    "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?auto=format&fit=crop&w=400&q=80",
  "شاي ومشروبات":
    "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80",
  "أجبان وألبان":
    "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80",
  "مياه وعصائر":
    "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=400&q=80",
  "السكر والمحليات":
    "https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=400&q=80",
  "مخبوزات وساندوتشات":
    "https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=400&q=80",
  "كيك وكوكيز ومافن":
    "https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?auto=format&fit=crop&w=400&q=80",
  "دونات فانسى ومميز":
    "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=400&q=80",
  "مونشكين ودونات عادي":
    "https://images.unsplash.com/photo-1579306194872-64d3b7bac4c2?auto=format&fit=crop&w=400&q=80",
  "وجبات خفيفة ومكسرات":
    "https://images.unsplash.com/photo-1508746829417-e6f548d8d6ed?auto=format&fit=crop&w=400&q=80",
  "دواجن ولحوم":
    "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=400&q=80",
  "أكواب وتملبرات مبيعات":
    "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80",
  "مستلزمات ونظافة":
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80",
  "المنظفات والمعقمات":
    "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80",
  "قرطاسية وملصقات":
    "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=400&q=80",
  "زي الموظفين (Uniform)":
    "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80",
};

interface KeywordMatch {
  keywords: string[];
  url: string;
}

const KEYWORD_MATCHERS: KeywordMatch[] = [
  // Bagels & Bakery
  {
    keywords: ["بيغل", "بيجل", "bagel"],
    url: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["كرواسون", "croissant"],
    url: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["مافن", "muffin", "كب كيك"],
    url: "https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?auto=format&fit=crop&w=400&q=80",
  },
  // Munchkins
  {
    keywords: ["مونشكين", "munchkin", "كرات دونات"],
    url: "https://images.unsplash.com/photo-1579306194872-64d3b7bac4c2?auto=format&fit=crop&w=400&q=80",
  },
  // Brownies & Cookies
  {
    keywords: ["براوني", "brownie"],
    url: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["كوكيز", "cookie", "cookies"],
    url: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=400&q=80",
  },
  // Fancy / Frosted / Strawberry / Sprinkles Donuts
  {
    keywords: ["فانسى", "فانسي", "مميز", "فراولة", "رشات", "sprinkle", "frosted", "fancy"],
    url: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=400&q=80",
  },
  // Chocolate
  {
    keywords: ["شوكولاته", "شوكولاتة", "chocolate", "شوكو"],
    url: "https://images.unsplash.com/photo-1527515545081-5db817172677?auto=format&fit=crop&w=400&q=80",
  },
  // Glazed / Classic Donut
  {
    keywords: ["سادة", "عادي", "glazed", "plain donut"],
    url: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80",
  },
  // Coffee drinks
  {
    keywords: ["كابتشينو", "لاتيه", "cappuccino", "latte"],
    url: "https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["إسبريسو", "اسبريسو", "espresso"],
    url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["بارد", "مثلج", "iced", "cold brew", "ايس"],
    url: "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=400&q=80",
  },
  // Water & Juices
  {
    keywords: ["ماء", "مياه", "water"],
    url: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["عصير", "برتقال", "juice", "orange juice"],
    url: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=400&q=80",
  },
  // Tea
  {
    keywords: ["شاي", "tea"],
    url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80",
  },
  // Milk & Dairy
  {
    keywords: ["حليب", "لبن", "milk", "cream", "قشطة"],
    url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80",
  },
  // Sugar & Sweeteners
  {
    keywords: ["سكر", "sugar", "محلي", "sweetener"],
    url: "https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=400&q=80",
  },
  // Cups & Packaging
  {
    keywords: ["أكواب ساخنة", "كوب ساخن", "كوب 12", "كوب 14", "كوب 16", "hot cup"],
    url: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["أكواب باردة", "كوب بارد", "كوب بلاستيك", "cold cup", "plastic cup"],
    url: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["غطاء", "أغطية", "lid", "lids"],
    url: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["حامل", "غلاف", "سليف", "carrier", "sleeve"],
    url: "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["صندوق", "علبة", "علب", "box", "boxes"],
    url: "https://images.unsplash.com/photo-1525607551316-4a8e16d1f9ba?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["كيس", "أكياس", "bag", "bags"],
    url: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80",
  },
  // Cleaning & Disposables
  {
    keywords: ["معقم", "منظف", "مطهر", "إيكولاب", "ecolab", "sanitizer", "soap"],
    url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80",
  },
  {
    keywords: ["مكنسة", "مجرفة", "مساحة", "فرشاة", "broom", "dustpan", "squeegee"],
    url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80",
  },
  // Uniform
  {
    keywords: ["مريلة", "يونيفورم", "زي", "apron", "uniform", "cap", "قبعة"],
    url: "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80",
  },
  // Labels & Stationery
  {
    keywords: ["ملصق", "استيكر", "ورق", "طابعة", "label", "sticker", "receipt"],
    url: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=400&q=80",
  },
];

/**
 * Returns a high quality image URL for any product:
 * 1. Checks if the product has a custom uploaded imageUrl.
 * 2. Matches product name keywords.
 * 3. Falls back to category image.
 * 4. Falls back to default Dunkin' photo.
 */
export function getProductImage(product?: {
  code?: string;
  imageUrl?: string | null;
  category?: string;
  nameAr?: string;
  nameEn?: string;
}): string {
  if (!product) return DEFAULT_DUNKIN_IMAGE;

  // Custom uploaded image on product object
  if (product.imageUrl && product.imageUrl.trim() !== "") {
    return product.imageUrl;
  }

  // Uploaded user image mapped by product code
  if (product.code && PRODUCT_UPLOADED_IMAGES[product.code]) {
    return PRODUCT_UPLOADED_IMAGES[product.code];
  }

  // Keyword match
  const searchStr = `${product.nameAr ?? ""} ${product.nameEn ?? ""}`.toLowerCase();
  for (const matcher of KEYWORD_MATCHERS) {
    if (matcher.keywords.some((kw) => searchStr.includes(kw.toLowerCase()))) {
      return matcher.url;
    }
  }

  // Category fallback
  if (product.category && CATEGORY_IMAGES[product.category]) {
    return CATEGORY_IMAGES[product.category];
  }

  return DEFAULT_DUNKIN_IMAGE;
}

export function getCategoryFallbackImage(category?: string): string {
  if (category && CATEGORY_IMAGES[category]) {
    return CATEGORY_IMAGES[category];
  }
  return DEFAULT_DUNKIN_IMAGE;
}
