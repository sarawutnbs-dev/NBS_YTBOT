/**
 * Knowledge Packs for guiding product selection and recommendation.
 *
 * Currently implements the "Notebook" category per provided guidelines.
 * Other categories can be added later following the same shape.
 */

export type NotebookUseCaseKey =
  | "Office & Study"
  | "Video Editing & Graphic Design"
  | "Gaming"
  | "Entertainment & Casual"
  | "Programming & Dev Work"
  | "AI & Data Science"
  | "Business & Portability";

export interface NotebookUseCasePack {
  category: NotebookUseCaseKey;
  use_case: string;
  cpu: string;
  ram: string;
  storage: string;
  gpu: string;
  screen: string;
  price_range?: string;
  battery?: string;
  weight?: string;
  examples: string[];
  reason: string;
  tips: string;
}

export const NOTEBOOK_KNOWLEDGE_PACK: NotebookUseCasePack[] = [
  {
    category: "Office & Study",
    use_case: "เรียนออนไลน์ / งานเอกสารทั่วไป (Word, Excel, Google Docs)",
    cpu: "Intel Core i3 / Ryzen 3 ขึ้นไป",
    ram: "8GB ขึ้นไป (16GB แนะนำสำหรับงานหลายแท็บ)",
    storage: "SSD 512GB แนะนำ",
    gpu: "iGPU (Intel Iris Xe / AMD Radeon Vega)",
    screen: "14–15.6” Full HD, Anti-glare",
    price_range: "13,000–22,000 THB",
    examples: [
      "Acer Aspire 3 i3-1315U",
      "ASUS Vivobook Go Ryzen 3 7320U",
      "Lenovo IdeaPad 3 i3 12th Gen"
    ],
    reason:
      "เหมาะสำหรับนักเรียนและพนักงานที่ใช้งานเอกสารทั่วไปและเรียนออนไลน์ ไม่ต้องการ GPU แยก ประหยัดพลังงานและเบา",
    tips:
      "เลือกเครื่องที่มีช่องอัปเกรด RAM/SSD เผื่อในอนาคต และกล้องเว็บแคมคุณภาพดีหากเรียนออนไลน์บ่อย"
  },
  {
    category: "Video Editing & Graphic Design",
    use_case: "Premiere Pro / Photoshop / Canva / DaVinci Resolve เบื้องต้น",
    cpu: "Intel Core i5 / Ryzen 5 ขึ้นไป (H-series จะดีกว่า)",
    ram: "16GB ขึ้นไป",
    storage: "SSD 512GB – 1TB (NVMe)",
    gpu: "NVIDIA GTX 1650 / RTX 3050 / AMD Radeon 660M+",
    screen: "15.6” IPS 100% sRGB หรือ OLED",
    price_range: "25,000–40,000 THB",
    examples: [
      "ASUS Vivobook Pro 15 OLED i5-13500H + RTX 3050",
      "HP Victus 16 Ryzen 5 7535HS + GTX 1650",
      "MSI Modern 15 i5-12450H"
    ],
    reason:
      "ต้องการ CPU multi-core และ GPU ที่มี CUDA/Metal/OpenCL ช่วยเรนเดอร์งานเร็วขึ้น",
    tips:
      "เลือกรุ่นที่พอร์ตครบ เช่น HDMI, SD card, USB-C PD เพื่อใช้กับกล้องหรือ external drive ได้สะดวก"
  },
  {
    category: "Gaming",
    use_case:
      "เล่นเกมออนไลน์ / AAA / FPS เช่น Valorant, GTA V, Elden Ring",
    cpu: "Intel Core i5 / Ryzen 5 H-series ขึ้นไป",
    ram: "16GB ขึ้นไป",
    storage: "SSD 512GB ขึ้นไป (อัปเกรดได้)",
    gpu: "NVIDIA RTX 3050/3060 หรือ AMD RX 6600M",
    screen: "15.6” FHD 144Hz (IPS)",
    price_range: "28,000–50,000 THB",
    examples: [
      "Lenovo LOQ 15 i5-12450H + RTX 3050",
      "ASUS TUF Gaming F15 i5-13450HX + RTX 4060",
      "HP Omen 16 Ryzen 7 + RTX 3060"
    ],
    reason:
      "เน้น GPU แรงและระบบระบายความร้อนดี เพื่อเฟรมเรตสูงและเสถียร",
    tips:
      "อย่าลืมตรวจสอบระบบระบายความร้อนและพอร์ต LAN ถ้าเล่นเกมออนไลน์เป็นหลัก"
  },
  {
    category: "Entertainment & Casual",
    use_case: "ดู Netflix, YouTube, เล่นโซเชียล, พกพาเบา",
    cpu: "Intel N200 / Ryzen 3 / i3 U-series",
    ram: "8GB",
    storage: "SSD 256–512GB",
    gpu: "iGPU",
    screen: "13–15” Full HD / OLED 300 nits",
    price_range: "12,000–20,000 THB",
    examples: [
      "ASUS Vivobook 14 N200",
      "Lenovo IdeaPad Slim 3 Ryzen 3 7320U",
      "HP 14s i3-N305"
    ],
    reason:
      "เน้นเบา ประหยัดแบต พกพาสะดวก เหมาะกับดูสื่อบันเทิงทั่วไป",
    tips:
      "เลือกจอ OLED ถ้าดูหนังเยอะ สีสวยกว่า IPS แต่กินแบตกว่าเล็กน้อย"
  },
  {
    category: "Programming & Dev Work",
    use_case:
      "เขียนโค้ด VSCode, Node.js, Docker, Virtual Machine",
    cpu: "Intel Core i5 / Ryzen 5 ขึ้นไป (12th Gen+)",
    ram: "16–32GB",
    storage: "SSD NVMe 512GB – 1TB",
    gpu: "iGPU พอได้ หรือ RTX ถ้าทำ AI/ML",
    screen: "14–16” QHD/2.5K, anti-glare, รองรับสองจอ",
    price_range: "25,000–45,000 THB",
    examples: [
      "ASUS ZenBook 14 i5-13500H",
      "Dell Inspiron 14 Plus i7 + 32GB",
      "MacBook Air M2 (ถ้าใช้ macOS dev)"
    ],
    reason:
      "ต้องการ CPU multi-thread, RAM มาก, จอคมชัด, พอร์ตครบ (HDMI, USB-C, Ethernet)",
    tips:
      "เลือกรุ่นที่คีย์บอร์ดดีและพอร์ต USB-C PD สำหรับชาร์จเร็ว"
  },
  {
    category: "AI & Data Science",
    use_case:
      "Python, TensorFlow, PyTorch, Jupyter, VSCode",
    cpu: "Intel i7 / Ryzen 7 H-series ขึ้นไป",
    ram: "32GB ขึ้นไป",
    storage: "SSD 1TB NVMe",
    gpu: "NVIDIA RTX 4060–4070 (VRAM ≥8GB)",
    screen: "15–17” QHD IPS 100% sRGB",
    price_range: "45,000–75,000 THB",
    examples: [
      "MSI Creator Z16 HX Studio",
      "ASUS ROG Zephyrus G14 RTX 4060",
      "Lenovo Legion 5 Pro RTX 4070"
    ],
    reason:
      "จำเป็นต้องมี VRAM และ CPU multi-core สำหรับการเทรนโมเดล AI และประมวลผล dataset ขนาดใหญ่",
    tips:
      "ตรวจสอบว่ามีระบบระบายความร้อนดี และรองรับการต่อ eGPU / external monitor"
  },
  {
    category: "Business & Portability",
    use_case:
      "งานเอกสาร, PowerPoint, Zoom, Email, เดินทางบ่อย",
    cpu: "Intel i5/i7 U-series หรือ Apple M2",
    ram: "16GB",
    storage: "SSD 512GB",
    gpu: "iGPU",
    screen: "13–14” IPS/OLED 400 nits",
    battery: "10–15 ชม.",
    weight: "ไม่เกิน 1.3 กก.",
    price_range: "30,000–60,000 THB",
    examples: ["MacBook Air M2", "ASUS ZenBook 14 OLED", "HP Spectre x360"],
    reason:
      "เน้นบางเบา ประสิทธิภาพสูง แบตอึด พกพาสะดวก เหมาะสำหรับผู้บริหารหรือพรีเซนต์งาน",
    tips:
      "เลือกรุ่นที่มี Thunderbolt 4, Wi-Fi 6E, กล้อง Full HD ขึ้นไป"
  }
];

/**
 * Lightweight mapping from use-case keywords to a canonical pack category key.
 */
export const NOTEBOOK_USECASE_KEYWORDS: Array<{ keywords: string[]; key: NotebookUseCaseKey }>= [
  { keywords: ["เอกสาร", "เรียน", "เรียนออนไลน์", "office", "excel", "word"], key: "Office & Study" },
  { keywords: ["ตัดต่อ", "premiere", "photoshop", "resolve", "กราฟิก"], key: "Video Editing & Graphic Design" },
  { keywords: ["เกม", "gaming", "valorant", "fps", "gta", "elden"], key: "Gaming" },
  { keywords: ["ดูหนัง", "netflix", "youtube", "บันเทิง", "casual"], key: "Entertainment & Casual" },
  { keywords: ["เขียนโค้ด", "program", "developer", "docker", "vm", "virtual"], key: "Programming & Dev Work" },
  { keywords: ["ai", "machine learning", "data", "pytorch", "tensorflow"], key: "AI & Data Science" },
  { keywords: ["พกพา", "ธุรกิจ", "business", "บางเบา", "เดินทาง"], key: "Business & Portability" }
];

/**
 * Convert a NotebookUseCasePack to a compact guidance string for prompts.
 */
export function renderNotebookGuidance(pack: NotebookUseCasePack): string {
  const lines = [
    `หมวด: ${pack.category}`,
    `Use-case: ${pack.use_case}`,
    `CPU: ${pack.cpu}`,
    `RAM: ${pack.ram}`,
    `Storage: ${pack.storage}`,
    `GPU: ${pack.gpu}`,
    `Screen: ${pack.screen}`,
    pack.battery ? `Battery: ${pack.battery}` : undefined,
    pack.weight ? `Weight: ${pack.weight}` : undefined,
    pack.price_range ? `งบแนะนำ: ${pack.price_range}` : undefined,
    `ตัวอย่างรุ่น: ${pack.examples.join(", ")}`,
    `เหตุผล: ${pack.reason}`,
    `เคล็ดลับ: ${pack.tips}`
  ].filter(Boolean);
  return lines.join("\n");
}
