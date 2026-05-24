// ── Common Chinese foods dataset ─────────────────────────────────────
// Nutrition values per 100g (or 100ml for liquids)

export type FoodEntry = {
  name: string;
  aliases: string[];
  /** kcal per 100g */
  kcal: number;
  /** grams carb per 100g */
  carbG: number;
  /** grams protein per 100g */
  proteinG: number;
  /** grams fat per 100g */
  fatG: number;
  category: string;
};

export const foodLibrary: FoodEntry[] = [
  // ── Staple (主食) ────────────────────────────────────────────────
  { name: "白米饭", aliases: ["米饭", "大米饭", "白饭"], kcal: 116, carbG: 25.9, proteinG: 2.6, fatG: 0.3, category: "主食" },
  { name: "糙米饭", aliases: ["糙米"], kcal: 111, carbG: 23.0, proteinG: 2.6, fatG: 0.9, category: "主食" },
  { name: "馒头", aliases: ["白馒头"], kcal: 236, carbG: 47.0, proteinG: 7.0, fatG: 1.1, category: "主食" },
  { name: "面条(煮)", aliases: ["面条", "挂面", "拉面"], kcal: 110, carbG: 24.3, proteinG: 2.8, fatG: 0.2, category: "主食" },
  { name: "包子(猪肉)", aliases: ["肉包", "猪肉包子"], kcal: 226, carbG: 28.0, proteinG: 9.0, fatG: 8.5, category: "主食" },
  { name: "饺子(猪肉)", aliases: ["饺子", "水饺"], kcal: 196, carbG: 24.0, proteinG: 9.5, fatG: 6.5, category: "主食" },
  { name: "粥(白米)", aliases: ["白粥", "稀饭", "米粥"], kcal: 46, carbG: 10.2, proteinG: 1.1, fatG: 0.1, category: "主食" },
  { name: "红薯", aliases: ["地瓜", "番薯"], kcal: 86, carbG: 20.1, proteinG: 1.6, fatG: 0.1, category: "主食" },
  { name: "玉米", aliases: ["甜玉米", "棒子"], kcal: 112, carbG: 22.8, proteinG: 4.0, fatG: 1.2, category: "主食" },
  { name: "全麦面包", aliases: ["全麦吐司"], kcal: 246, carbG: 41.0, proteinG: 12.0, fatG: 3.5, category: "主食" },

  // ── Protein (蛋白质) ─────────────────────────────────────────────
  { name: "鸡蛋(煮)", aliases: ["鸡蛋", "水煮蛋", "白煮蛋"], kcal: 144, carbG: 1.5, proteinG: 13.3, fatG: 8.8, category: "蛋白质" },
  { name: "鸡胸肉", aliases: ["鸡胸", "鸡脯肉"], kcal: 133, carbG: 0, proteinG: 31.0, fatG: 1.2, category: "蛋白质" },
  { name: "牛肉(瘦)", aliases: ["牛肉", "牛腱"], kcal: 125, carbG: 0, proteinG: 20.2, fatG: 4.2, category: "蛋白质" },
  { name: "猪肉(瘦)", aliases: ["猪里脊", "瘦肉"], kcal: 143, carbG: 0, proteinG: 20.3, fatG: 6.2, category: "蛋白质" },
  { name: "鱼肉(鲈鱼)", aliases: ["鱼", "鲈鱼", "清蒸鱼"], kcal: 105, carbG: 0, proteinG: 18.6, fatG: 3.4, category: "蛋白质" },
  { name: "虾仁", aliases: ["虾", "基围虾"], kcal: 87, carbG: 0, proteinG: 18.6, fatG: 0.8, category: "蛋白质" },
  { name: "豆腐", aliases: ["嫩豆腐", "老豆腐"], kcal: 73, carbG: 2.8, proteinG: 8.1, fatG: 3.7, category: "蛋白质" },

  // ── Vegetables (蔬菜) ────────────────────────────────────────────
  { name: "西兰花", aliases: ["西蓝花", "花椰菜"], kcal: 34, carbG: 4.3, proteinG: 4.1, fatG: 0.6, category: "蔬菜" },
  { name: "番茄", aliases: ["西红柿", "番茄"], kcal: 18, carbG: 3.9, proteinG: 0.9, fatG: 0.2, category: "蔬菜" },
  { name: "黄瓜", aliases: ["青瓜"], kcal: 16, carbG: 2.9, proteinG: 0.7, fatG: 0.2, category: "蔬菜" },
  { name: "生菜", aliases: ["叶生菜"], kcal: 13, carbG: 1.8, proteinG: 1.3, fatG: 0.3, category: "蔬菜" },
  { name: "菠菜", aliases: ["菠菜"], kcal: 23, carbG: 3.6, proteinG: 2.9, fatG: 0.3, category: "蔬菜" },

  // ── Fruit (水果) ─────────────────────────────────────────────────
  { name: "苹果", aliases: ["红富士"], kcal: 52, carbG: 13.8, proteinG: 0.2, fatG: 0.1, category: "水果" },
  { name: "香蕉", aliases: ["香蕉"], kcal: 89, carbG: 22.8, proteinG: 1.1, fatG: 0.2, category: "水果" },
  { name: "橙子", aliases: ["橘子", "柑橘"], kcal: 47, carbG: 11.8, proteinG: 0.9, fatG: 0.1, category: "水果" },
  { name: "葡萄", aliases: ["提子"], kcal: 69, carbG: 18.1, proteinG: 0.7, fatG: 0.2, category: "水果" },
  { name: "西瓜", aliases: ["西瓜"], kcal: 30, carbG: 7.6, proteinG: 0.6, fatG: 0.1, category: "水果" },

  // ── Drinks (饮品) ────────────────────────────────────────────────
  { name: "美式咖啡", aliases: ["黑咖啡", "美式", "Americano"], kcal: 2, carbG: 0, proteinG: 0.1, fatG: 0, category: "饮品" },
  { name: "拿铁(全脂)", aliases: ["拿铁", "咖啡拿铁"], kcal: 56, carbG: 5.6, proteinG: 3.4, fatG: 2.4, category: "饮品" },
  { name: "奶茶(珍珠)", aliases: ["珍珠奶茶", "奶茶"], kcal: 72, carbG: 12.5, proteinG: 1.0, fatG: 2.0, category: "饮品" },
  { name: "可乐", aliases: ["可口可乐", "百事可乐"], kcal: 42, carbG: 10.6, proteinG: 0, fatG: 0, category: "饮品" },
  { name: "橙汁", aliases: ["鲜榨橙汁", "果汁"], kcal: 45, carbG: 10.4, proteinG: 0.7, fatG: 0.2, category: "饮品" },
  { name: "牛奶(全脂)", aliases: ["牛奶", "纯牛奶"], kcal: 64, carbG: 4.8, proteinG: 3.2, fatG: 3.6, category: "饮品" },
  { name: "豆浆(无糖)", aliases: ["豆浆", "豆奶"], kcal: 31, carbG: 1.8, proteinG: 2.9, fatG: 1.6, category: "饮品" },

  // ── Common dishes (家常菜) ───────────────────────────────────────
  { name: "西红柿炒蛋", aliases: ["番茄炒蛋", "番茄鸡蛋"], kcal: 98, carbG: 5.2, proteinG: 7.5, fatG: 5.5, category: "家常菜" },
  { name: "宫保鸡丁", aliases: ["宫保鸡丁"], kcal: 162, carbG: 8.5, proteinG: 15.0, fatG: 7.5, category: "家常菜" },
  { name: "麻婆豆腐", aliases: ["麻婆豆腐"], kcal: 128, carbG: 4.8, proteinG: 9.2, fatG: 8.5, category: "家常菜" },
  { name: "清炒时蔬", aliases: ["炒青菜", "炒蔬菜"], kcal: 45, carbG: 3.5, proteinG: 2.0, fatG: 2.5, category: "家常菜" },
  { name: "红烧肉", aliases: ["红烧猪肉"], kcal: 280, carbG: 5.0, proteinG: 14.0, fatG: 23.0, category: "家常菜" },
  { name: "糖醋排骨", aliases: ["糖醋排骨"], kcal: 218, carbG: 15.0, proteinG: 12.5, fatG: 12.0, category: "家常菜" },
  { name: "鱼香肉丝", aliases: ["鱼香肉丝"], kcal: 148, carbG: 8.0, proteinG: 11.5, fatG: 8.0, category: "家常菜" },
  { name: "酸辣土豆丝", aliases: ["土豆丝", "炒土豆丝"], kcal: 96, carbG: 17.5, proteinG: 2.0, fatG: 2.5, category: "家常菜" },
  { name: "回锅肉", aliases: ["回锅肉"], kcal: 235, carbG: 5.5, proteinG: 12.0, fatG: 19.0, category: "家常菜" },

  // ── Snacks (零食/坚果) ───────────────────────────────────────────
  { name: "混合坚果", aliases: ["坚果", "每日坚果"], kcal: 607, carbG: 16.0, proteinG: 20.0, fatG: 53.0, category: "零食" },
  { name: "酸奶(原味)", aliases: ["酸奶", "原味酸奶"], kcal: 72, carbG: 9.3, proteinG: 3.6, fatG: 2.5, category: "零食" },
  { name: "巧克力(黑)", aliases: ["黑巧克力", "巧克力"], kcal: 546, carbG: 60.0, proteinG: 5.0, fatG: 31.0, category: "零食" },
];

// ── Lookup / search ──────────────────────────────────────────────────

/**
 * Fuzzy-match a food name or alias against the library.
 * Returns matching entries sorted by relevance (exact > prefix > contains).
 */
export function searchFood(query: string): FoodEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact: FoodEntry[] = [];
  const prefix: FoodEntry[] = [];
  const contains: FoodEntry[] = [];

  for (const entry of foodLibrary) {
    const names = [entry.name.toLowerCase(), ...entry.aliases.map((a) => a.toLowerCase())];
    if (names.some((n) => n === q)) {
      exact.push(entry);
    } else if (names.some((n) => n.startsWith(q) || q.startsWith(n))) {
      prefix.push(entry);
    } else if (names.some((n) => n.includes(q) || q.includes(n))) {
      contains.push(entry);
    }
  }

  return [...exact, ...prefix, ...contains];
}

/**
 * Get nutrition for a food by name, scaled to given quantity in grams.
 * Returns null if not found.
 */
export function lookupFood(
  query: string,
  quantityG: number,
): { entry: FoodEntry; scaled: { kcal: number; carbG: number; proteinG: number; fatG: number } } | null {
  const results = searchFood(query);
  if (results.length === 0) return null;

  const entry = results[0];
  const factor = quantityG / 100;
  return {
    entry,
    scaled: {
      kcal: Math.round(entry.kcal * factor),
      carbG: Math.round(entry.carbG * factor * 10) / 10,
      proteinG: Math.round(entry.proteinG * factor * 10) / 10,
      fatG: Math.round(entry.fatG * factor * 10) / 10,
    },
  };
}
