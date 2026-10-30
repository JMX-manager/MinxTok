// 点化学式 → 这个物质的说明卡（物理性质 / 化学性质）
// 前端点 .c-mol 时走这里：先查常用物质表（秒回、不烧 token），表里没有的再让模型补，
// 结果按「化学式 + 状态」缓存一个月，同一个式子只花一次钱。
import { corsHeaders, json } from './util.js';

const CHEM_TTL = 60 * 60 * 24 * 30;

// 常用物质速查表：中学化学里点得最多的这些，直接给准确文案，不等模型
const TABLE = {
  H2O: { name: '水', phys: '无色无味的液体，沸点 100 ℃、凝固点 0 ℃，4 ℃ 时密度最大；能溶解很多物质。', chem: '化学性质较稳定，高温或通电下可分解：2H₂O =[通电] 2H₂↑ + O₂↑；能与活泼金属（如钠）、非金属氧化物（如 SO₃）反应。' },
  O2: { name: '氧气', phys: '无色无味气体，密度比空气略大，不易溶于水；液态、固态呈淡蓝色。', chem: '助燃、能支持燃烧；与大多数金属、非金属反应生成氧化物，如 3Fe + 2O₂ =[点燃] Fe₃O₄、C + O₂ =[点燃] CO₂。' },
  O3: { name: '臭氧', phys: '淡蓝色气体，有特殊腥味，密度比空气大，水溶性比氧气稍好。', chem: '氧化性比氧气强，能漂白、消毒杀菌；受热易分解为氧气：2O₃ = 3O₂。' },
  H2: { name: '氢气', phys: '无色无味、密度最小的气体，难溶于水；燃烧火焰呈淡蓝色。', chem: '可燃，点燃前必须验纯；还原性较强，能还原氧化铜：H₂ + CuO =[△] Cu + H₂O；与氯气光照可化合。' },
  CO2: { name: '二氧化碳', phys: '无色无味气体，密度比空气大，能溶于水；固态叫干冰，易升华。', chem: '不燃烧也不支持燃烧；与水反应生成碳酸：CO₂ + H₂O = H₂CO₃；与碱反应：CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O。' },
  CO: { name: '一氧化碳', phys: '无色无味气体，密度略小于空气，难溶于水；有剧毒。', chem: '可燃：2CO + O₂ =[点燃] 2CO₂；还原性较强，能还原氧化铁：3CO + Fe₂O₃ =[高温] 2Fe + 3CO₂。' },
  Na2O2: { name: '过氧化钠', phys: '淡黄色粉末，有强氧化性，易吸潮。', chem: '与水和二氧化碳反应都放出氧气：2Na₂O₂ + 2H₂O = 4NaOH + O₂↑、2Na₂O₂ + 2CO₂ = 2Na₂CO₃ + O₂；可作供氧剂、漂白剂。' },
  Na2O: { name: '氧化钠', phys: '白色固体，易与水化合。', chem: '碱性氧化物：Na₂O + H₂O = 2NaOH、Na₂O + CO₂ = Na₂CO₃；与酸反应生成盐和水。' },
  NaOH: { name: '氢氧化钠', phys: '白色固体，易潮解、易溶于水并放热；俗称烧碱、火碱、苛性钠，有强腐蚀性。', chem: '强碱，能与酸中和：NaOH + HCl = NaCl + H₂O；与酸性氧化物反应：2NaOH + CO₂ = Na₂CO₃ + H₂O；与某些盐溶液反应生成沉淀。' },
  Na2CO3: { name: '碳酸钠', phys: '白色粉末，易溶于水，水溶液显碱性；俗称纯碱、苏打。', chem: '与酸反应放出二氧化碳：Na₂CO₃ + 2HCl = 2NaCl + H₂O + CO₂↑；与石灰水反应生成沉淀：Na₂CO₃ + Ca(OH)₂ = CaCO₃↓ + 2NaOH。' },
  NaHCO3: { name: '碳酸氢钠', phys: '白色细小晶体，能溶于水，水溶液显弱碱性；俗称小苏打。', chem: '受热易分解：2NaHCO₃ =[△] Na₂CO₃ + H₂O + CO₂↑；与酸反应放出二氧化碳，常用于灭火和治胃酸过多。' },
  NaCl: { name: '氯化钠', phys: '白色晶体，易溶于水，味咸；熔点较高。', chem: '与硝酸银反应生成白色沉淀：NaCl + AgNO₃ = AgCl↓ + NaNO₃；电解饱和食盐水可得氢氧化钠、氢气和氯气。' },
  HCl: { name: '盐酸（氯化氢）', phys: '氯化氢是无色有刺激性气味的气体，极易溶于水；盐酸是无色液体，有挥发性。', chem: '强酸，能使石蕊变红；与活泼金属反应放出氢气：Zn + 2HCl = ZnCl₂ + H₂↑；与碳酸盐反应放出二氧化碳；与碱中和。' },
  H2SO4: { name: '硫酸', phys: '无色黏稠液体，不易挥发；浓硫酸溶于水放出大量热，有吸水性和脱水性。', chem: '强酸，稀硫酸与金属反应放出氢气：Fe + H₂SO₄ = FeSO₄ + H₂↑；浓硫酸有强氧化性，与铜加热反应：Cu + 2H₂SO₄(浓) =[△] CuSO₄ + SO₂↑ + 2H₂O。' },
  HNO3: { name: '硝酸', phys: '无色有刺激性气味的液体，易挥发，见光易分解。', chem: '强氧化性酸，与铜反应放出二氧化氮：Cu + 4HNO₃(浓) = Cu(NO₃)₂ + 2NO₂↑ + 2H₂O；稀硝酸产物为一氧化氮。' },
  Cl2: { name: '氯气', phys: '黄绿色有刺激性气味的有毒气体，密度比空气大，能溶于水（1 体积水约溶 2 体积氯气）。', chem: '强氧化性：与钠、铁、铜等金属直接化合；与水反应生成盐酸和次氯酸：Cl₂ + H₂O = HCl + HClO；与碱反应制漂白液。' },
  NH3: { name: '氨', phys: '无色有刺激性气味的气体，密度比空气小，极易溶于水，水溶液显碱性。', chem: '与水反应生成一水合氨：NH₃ + H₂O ⇌ NH₃·H₂O；与酸反应生成铵盐：NH₃ + HCl = NH₄Cl；催化氧化可制一氧化氮。' },
  CH4: { name: '甲烷', phys: '无色无味气体，密度比空气小，难溶于水；天然气、沼气的主要成分。', chem: '可燃：CH₄ + 2O₂ =[点燃] CO₂ + 2H₂O；与氯气在光照下发生取代反应，生成一氯甲烷等。' },
  C2H5OH: { name: '乙醇', phys: '无色有特殊香味的液体，易挥发，能与水以任意比互溶；俗称酒精。', chem: '可燃：C₂H₅OH + 3O₂ =[点燃] 2CO₂ + 3H₂O；可被氧化成乙醛、乙酸；与钠反应放出氢气。' },
  Fe: { name: '铁', phys: '银白色金属，有金属光泽，质软有延展性，能被磁铁吸引。', chem: '在潮湿空气中生锈；与稀酸反应放出氢气；与硫酸铜溶液反应：Fe + CuSO₄ = FeSO₄ + Cu；在氧气中燃烧生成四氧化三铁。' },
  Cu: { name: '铜', phys: '紫红色金属，有良好导电导热性，延展性好。', chem: '不活泼，不与稀盐酸、稀硫酸反应；加热生成氧化铜：2Cu + O₂ =[△] 2CuO；与硝酸、浓硫酸反应。' },
  Fe2O3: { name: '氧化铁', phys: '红棕色粉末，不溶于水；俗称铁红。', chem: '与酸反应生成铁盐：Fe₂O₃ + 6HCl = 2FeCl₃ + 3H₂O；可被一氧化碳还原：Fe₂O₃ + 3CO =[高温] 2Fe + 3CO₂。' },
  CuO: { name: '氧化铜', phys: '黑色粉末，不溶于水。', chem: '与稀酸反应生成铜盐：CuO + 2HCl = CuCl₂ + H₂O；能被氢气、碳还原：CuO + H₂ =[△] Cu + H₂O。' },
  CaCO3: { name: '碳酸钙', phys: '白色固体，难溶于水；石灰石、大理石、贝壳的主要成分。', chem: '高温分解：CaCO₃ =[高温] CaO + CO₂↑；与稀盐酸反应放出二氧化碳：CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑。' },
  CaO: { name: '氧化钙', phys: '白色块状固体，俗称生石灰，易吸水。', chem: '与水化合放出大量热：CaO + H₂O = Ca(OH)₂；与二氧化碳反应生成碳酸钙，常用作干燥剂。' },
  'Ca(OH)2': { name: '氢氧化钙', phys: '白色粉末，微溶于水，水溶液叫石灰水；俗称熟石灰、消石灰。', chem: '与二氧化碳反应变浑浊：Ca(OH)₂ + CO₂ = CaCO₃↓ + H₂O；与酸中和；与碳酸钠溶液反应生成沉淀。' },
  KMnO4: { name: '高锰酸钾', phys: '紫黑色晶体，易溶于水，水溶液呈紫红色。', chem: '强氧化性，加热分解制氧气：2KMnO₄ =[△] K₂MnO₄ + MnO₂ + O₂↑；酸性溶液中可氧化多种还原性物质。' },
  KClO3: { name: '氯酸钾', phys: '白色晶体，能溶于水，受热易分解。', chem: '在二氧化锰催化下加热分解制氧气：2KClO₃ =[MnO₂/△] 2KCl + 3O₂↑。' },
  SO2: { name: '二氧化硫', phys: '无色有刺激性气味的有毒气体，密度比空气大，易溶于水。', chem: '与水反应生成亚硫酸：SO₂ + H₂O ⇌ H₂SO₃；有漂白性但会复原；与碱反应生成亚硫酸盐。' },
  Zn: { name: '锌', phys: '银白色金属，密度较大，表面易氧化变暗。', chem: '与稀酸反应放出氢气：Zn + H₂SO₄ = ZnSO₄ + H₂↑；能置换出铜等不活泼金属；用于镀锌防锈。' },
  Mg: { name: '镁', phys: '银白色轻金属，质软，燃烧时发出耀眼白光。', chem: '在空气中燃烧：2Mg + O₂ =[点燃] 2MgO；与热水反应放出氢气；与稀酸反应生成氢气。' },
  Al: { name: '铝', phys: '银白色金属，密度小，表面易形成致密氧化膜。', chem: '常温下被氧化膜保护；与稀酸、强碱都能反应放出氢气；高温下能还原金属氧化物（铝热反应）。' },
  AgNO3: { name: '硝酸银', phys: '无色晶体，易溶于水，见光易分解变黑。', chem: '与氯离子反应生成白色沉淀：AgNO₃ + NaCl = AgCl↓ + NaNO₃；有氧化性，可用于检验氯离子。' },
  BaCl2: { name: '氯化钡', phys: '白色晶体，易溶于水，有毒。', chem: '与硫酸根反应生成白色沉淀：BaCl₂ + H₂SO₄ = BaSO₄↓ + 2HCl；常用于检验硫酸根离子。' },
  H2O2: { name: '过氧化氢', phys: '无色黏稠液体，能与水互溶；水溶液俗称双氧水。', chem: '在二氧化锰催化下分解：2H₂O₂ =[MnO₂] 2H₂O + O₂↑；有氧化性，可杀菌消毒、漂白。' },
  C: { name: '碳', phys: '黑色固体（金刚石为无色透明晶体），不溶于水。', chem: '可燃：C + O₂ =[点燃] CO₂；高温下有还原性：C + 2CuO =[高温] 2Cu + CO₂↑。' },
  S: { name: '硫', phys: '淡黄色固体，不溶于水，易溶于二硫化碳。', chem: '在空气中燃烧发淡蓝色火焰：S + O₂ =[点燃] SO₂；与铁、铜等金属直接化合生成硫化物。' },
  N2: { name: '氮气', phys: '无色无味气体，难溶于水，占空气体积约 78%。', chem: '化学性质很稳定，常温下几乎不反应；高温放电时可与氧气、氢气反应。' },
  NH4Cl: { name: '氯化铵', phys: '白色晶体，易溶于水，有苦咸味。', chem: '与碱共热放出氨气：NH₄Cl + NaOH =[△] NaCl + NH₃↑ + H₂O；受热易分解，可用作氮肥。' },
  CuSO4: { name: '硫酸铜', phys: '白色粉末，遇水变蓝色；五水合物是蓝色晶体（胆矾）。', chem: '水溶液与铁反应：Fe + CuSO₄ = FeSO₄ + Cu；与氢氧化钠反应生成蓝色沉淀；可用于检验水。' },
  FeSO4: { name: '硫酸亚铁', phys: '白色粉末，水溶液呈浅绿色，易被氧化。', chem: '有还原性，易被氧化成硫酸铁；与氢氧化钠反应先生成白色沉淀，迅速变灰绿最终变红褐色。' },
  FeCl3: { name: '氯化铁', phys: '棕黄色固体，易潮解，水溶液呈黄色。', chem: '与氢氧化钠反应生成红褐色沉淀：FeCl₃ + 3NaOH = Fe(OH)₃↓ + 3NaCl；有氧化性，可腐蚀铜制电路板。' },
  KOH: { name: '氢氧化钾', phys: '白色固体，易潮解，易溶于水并放热，有强腐蚀性。', chem: '强碱，性质与氢氧化钠相似；能与酸、酸性氧化物、某些盐溶液反应。' },
  K2CO3: { name: '碳酸钾', phys: '白色粉末，易溶于水，水溶液显碱性。', chem: '与酸反应放出二氧化碳；草木灰的主要成分，可作钾肥。' },
  P: { name: '磷', phys: '白磷是蜡状固体、有毒、易自燃；红磷是暗红色粉末，较稳定。', chem: '燃烧生成五氧化二磷：4P + 5O₂ =[点燃] 2P₂O₅；红磷可用于测定空气中氧气含量。' },
  P2O5: { name: '五氧化二磷', phys: '白色固体，极易吸水。', chem: '与水反应生成磷酸：P₂O₅ + 3H₂O = 2H₃PO₄；是常用的干燥剂和酸性氧化物。' },
  SiO2: { name: '二氧化硅', phys: '无色透明或白色固体，坚硬难溶；沙子、石英的主要成分。', chem: '酸性氧化物，与氢氟酸反应：SiO₂ + 4HF = SiF₄↑ + 2H₂O；高温下与碳酸钠、碳酸钙反应制玻璃。' },
  CH3COOH: { name: '乙酸', phys: '无色有刺激性酸味的液体，易溶于水；俗称醋酸，纯品称冰醋酸。', chem: '弱酸，能与碱中和；与碳酸盐反应放出二氧化碳；与乙醇在浓硫酸催化下酯化生成乙酸乙酯。' },
  C6H12O6: { name: '葡萄糖', phys: '白色晶体，易溶于水，有甜味。', chem: '能被氧化，与银氨溶液发生银镜反应；在人体内氧化供能：C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O。' },
  'Cu(OH)2': { name: '氢氧化铜', phys: '蓝色固体，难溶于水。', chem: '受热分解生成黑色氧化铜：Cu(OH)₂ =[△] CuO + H₂O；能与酸反应生成铜盐，可被醛类还原成砖红色氧化亚铜。' },
  'Fe(OH)3': { name: '氢氧化铁', phys: '红褐色固体，难溶于水。', chem: '受热分解：2Fe(OH)₃ =[△] Fe₂O₃ + 3H₂O；与酸反应生成铁盐。' },
  MgO: { name: '氧化镁', phys: '白色固体，熔点很高，难溶于水。', chem: '与酸反应生成镁盐：MgO + 2HCl = MgCl₂ + H₂O；耐火材料，也用于制镁。' },
  Al2O3: { name: '氧化铝', phys: '白色固体，熔点很高，难溶于水。', chem: '两性氧化物，既溶于强酸也溶于强碱；电解熔融氧化铝可制金属铝。' },

  // ---- 补充一批常见物质（明轩 2026-10-30：还有化学式查不到）----
  H2S: { name: '硫化氢', phys: '无色有臭鸡蛋气味的气体，有毒，密度比空气略大，微溶于水。', chem: '水溶液叫氢硫酸，是弱酸；可燃：2H₂S + 3O₂ =[点燃] 2SO₂ + 2H₂O；与二氧化硫反应 2H₂S + SO₂ = 3S↓ + 2H₂O；能使湿润的醋酸铅试纸变黑。' },
  SO3: { name: '三氧化硫', phys: '常温下为无色易挥发的液体（固态呈白色），遇水剧烈反应并放出大量热。', chem: '酸性氧化物：SO₃ + H₂O = H₂SO₄；与碱、碱性氧化物反应生成硫酸盐。' },
  H2SO3: { name: '亚硫酸', phys: '只存在于水溶液中，无色、有刺激性气味。', chem: '中强酸，不稳定：H₂SO₃ = H₂O + SO₂↑；有还原性，能被氧气氧化成硫酸。' },
  H2CO3: { name: '碳酸', phys: '只存在于水溶液中，弱酸性、不稳定。', chem: 'H₂CO₃ = H₂O + CO₂↑；能使石蕊变红，与碱反应生成碳酸盐。' },
  HClO: { name: '次氯酸', phys: '只存在于水溶液中，有刺激性气味，见光易分解。', chem: '弱酸、强氧化性，能漂白和杀菌；光照分解：2HClO =[光照] 2HCl + O₂↑。' },
  H3PO4: { name: '磷酸', phys: '无色黏稠液体或无色晶体，易溶于水，不挥发。', chem: '中强酸，与碱反应生成磷酸盐；受热逐步脱水生成焦磷酸、偏磷酸。' },
  HF: { name: '氢氟酸', phys: '无色有刺激性气味的液体，易挥发，剧毒，能腐蚀玻璃。', chem: '弱酸：SiO₂ + 4HF = SiF₄↑ + 2H₂O，因此用塑料瓶盛装；能腐蚀皮肤和骨骼。' },
  Na2SO4: { name: '硫酸钠', phys: '白色固体，易溶于水，俗称元明粉。', chem: '与氯化钡溶液反应生成白色沉淀：BaCl₂ + Na₂SO₄ = BaSO₄↓ + 2NaCl。' },
  Na2SO3: { name: '亚硫酸钠', phys: '白色粉末，易溶于水。', chem: '有还原性，能被氧气氧化成硫酸钠；与酸反应放出二氧化硫：Na₂SO₃ + 2HCl = 2NaCl + H₂O + SO₂↑。' },
  NaNO3: { name: '硝酸钠', phys: '无色晶体，易溶于水，味咸。', chem: '强氧化性；受热分解：2NaNO₃ =[△] 2NaNO₂ + O₂↑；与浓硫酸加热可制硝酸。' },
  Na2S: { name: '硫化钠', phys: '白色固体，易潮解，水溶液呈强碱性。', chem: '与酸反应放出硫化氢：Na₂S + 2HCl = 2NaCl + H₂S↑；易被氧化成硫和硫酸钠。' },
  NaClO: { name: '次氯酸钠', phys: '白色固体，溶于水，水溶液俗称漂白液。', chem: '强氧化性，能漂白杀菌；吸收二氧化碳后生成次氯酸：CO₂ + NaClO + H₂O = NaHCO₃ + HClO。' },
  KNO3: { name: '硝酸钾', phys: '无色晶体，易溶于水，受热分解。', chem: '强氧化性；2KNO₃ =[△] 2KNO₂ + O₂↑；与硫粉、木炭按比例混合就是黑火药。' },
  KCl: { name: '氯化钾', phys: '无色晶体，易溶于水。', chem: '与硝酸银溶液反应生成白色沉淀 AgCl；农业上作钾肥。' },
  K2SO4: { name: '硫酸钾', phys: '无色晶体，易溶于水。', chem: '与氯化钡溶液反应生成白色沉淀 BaSO₄；常用钾肥。' },
  K2MnO4: { name: '锰酸钾', phys: '墨绿色固体，溶于水后溶液呈绿色。', chem: '在酸性条件下发生歧化：3K₂MnO₄ + 4HCl = 2KMnO₄ + MnO₂↓ + 4KCl + 2H₂O。' },
  K2Cr2O7: { name: '重铬酸钾', phys: '橙红色晶体，易溶于水，有毒。', chem: '强氧化性，酸性溶液中能把二价铁氧化成三价铁：K₂Cr₂O₇ + 6FeSO₄ + 7H₂SO₄ = 3Fe₂(SO₄)₃ + Cr₂(SO₄)₃ + K₂SO₄ + 7H₂O。' },
  KSCN: { name: '硫氰化钾', phys: '无色晶体，易溶于水。', chem: '与 Fe³⁺ 结合成血红色溶液，是检验 Fe³⁺ 最常用的方法。' },
  MnO2: { name: '二氧化锰', phys: '黑色粉末，难溶于水。', chem: '作过氧化氢分解的催化剂：2H₂O₂ =[MnO₂] 2H₂O + O₂↑；与浓盐酸共热制氯气：MnO₂ + 4HCl(浓) =[△] MnCl₂ + Cl₂↑ + 2H₂O。' },
  FeCl2: { name: '氯化亚铁', phys: '无水物呈灰绿色，水溶液为浅绿色。', chem: '易被氧化：2FeCl₂ + Cl₂ = 2FeCl₃；与氢氧化钠溶液生成白色沉淀，随即变灰绿、最后变红褐。' },
  Fe3O4: { name: '四氧化三铁', phys: '黑色晶体，有磁性，俗称磁铁矿。', chem: '可看作 FeO 与 Fe₂O₃ 的混合氧化物：Fe₃O₄ + 8HCl = FeCl₂ + 2FeCl₃ + 4H₂O；能被氢气还原成铁。' },
  FeO: { name: '氧化亚铁', phys: '黑色粉末，难溶于水。', chem: '碱性氧化物：FeO + 2HCl = FeCl₂ + H₂O；在空气中受热易被氧化成四氧化三铁。' },
  'Fe(OH)2': { name: '氢氧化亚铁', phys: '白色固体，难溶于水。', chem: '极易被氧气氧化：4Fe(OH)₂ + O₂ + 2H₂O = 4Fe(OH)₃，颜色由白变灰绿再变红褐。' },
  'Fe2(SO4)3': { name: '硫酸铁', phys: '白色或淡黄色粉末，水溶液呈黄色。', chem: '与氢氧化钠溶液生成红褐色沉淀；与铁反应生成硫酸亚铁：Fe₂(SO₄)₃ + Fe = 3FeSO₄。' },
  CuCl2: { name: '氯化铜', phys: '棕黄色固体，水溶液呈蓝绿色。', chem: '与氢氧化钠溶液生成蓝色沉淀：CuCl₂ + 2NaOH = Cu(OH)₂↓ + 2NaCl；与铁反应 Fe + CuCl₂ = FeCl₂ + Cu。' },
  Cu2O: { name: '氧化亚铜', phys: '砖红色固体，难溶于水，是检验醛基的产物。', chem: '在酸性溶液中歧化：Cu₂O + H₂SO₄ = CuSO₄ + Cu + H₂O；能被氢气还原成铜。' },
  'CuSO4·5H2O': { name: '五水硫酸铜（胆矾）', phys: '蓝色晶体，受热失去结晶水变成白色粉末，溶于水呈蓝色。', chem: 'CuSO₄·5H₂O =[△] CuSO₄ + 5H₂O；水溶液与氢氧化钠生成蓝色沉淀；与铁反应置换出铜。' },
  ZnCl2: { name: '氯化锌', phys: '白色固体，易潮解，易溶于水。', chem: '与氢氧化钠溶液生成白色沉淀 Zn(OH)₂，碱过量时沉淀溶解生成 Zn(OH)₄²⁻。' },
  ZnSO4: { name: '硫酸锌', phys: '无色晶体，易溶于水。', chem: '与氯化钡溶液生成白色沉淀 BaSO₄；与氢氧化钠溶液生成白色 Zn(OH)₂ 沉淀。' },
  MgCl2: { name: '氯化镁', phys: '无色晶体，易潮解，易溶于水。', chem: '与氢氧化钠溶液生成白色沉淀 Mg(OH)₂，不溶于过量碱；电解熔融氯化镁可制金属镁。' },
  MgSO4: { name: '硫酸镁', phys: '无色晶体，易溶于水，味苦。', chem: '与氢氧化钠溶液生成白色沉淀；医药上作泻药，工业上用于制镁盐。' },
  AlCl3: { name: '氯化铝', phys: '白色固体，易潮解，易溶于水。', chem: '与少量氢氧化钠生成白色沉淀，碱过量时沉淀溶解；水溶液因水解呈酸性。' },
  'Al2(SO4)3': { name: '硫酸铝', phys: '白色固体，易溶于水。', chem: '与氨水生成白色 Al(OH)₃ 沉淀；与碳酸氢钠溶液发生双水解，生成沉淀并放出二氧化碳。' },
  CaCl2: { name: '氯化钙', phys: '白色固体，易潮解，易溶于水，水溶液呈中性。', chem: '常用干燥剂；与碳酸钠溶液生成白色沉淀 CaCO₃。' },
  CaSO4: { name: '硫酸钙', phys: '白色固体，微溶于水，俗称石膏。', chem: '与碳酸钠溶液可转化为碳酸钙；加热到约 150 ℃ 变成熟石膏，加水后重新凝固。' },
  'Ca(HCO3)2': { name: '碳酸氢钙', phys: '只存在于水溶液中，是暂时硬水的主要成分。', chem: '受热分解：Ca(HCO₃)₂ =[△] CaCO₃↓ + H₂O + CO₂↑；与碱反应生成碳酸钙白色沉淀。' },
  BaSO4: { name: '硫酸钡', phys: '白色固体，难溶于水和稀酸，俗称重晶石。', chem: '不溶于稀硝酸，医学上作钡餐；由氯化钡与硫酸钠溶液反应制得。' },
  BaCO3: { name: '碳酸钡', phys: '白色固体，难溶于水，溶于酸。', chem: '与稀盐酸反应：BaCO₃ + 2HCl = BaCl₂ + H₂O + CO₂↑；能溶于酸，所以不能作钡餐。' },
  'Ba(OH)2': { name: '氢氧化钡', phys: '白色固体，可溶于水，水溶液俗称钡水。', chem: '强碱，与硫酸或可溶性硫酸盐生成白色沉淀；与二氧化碳反应变浑浊。' },
  BaO: { name: '氧化钡', phys: '白色固体，遇水剧烈反应并放热。', chem: '碱性氧化物：BaO + H₂O = Ba(OH)₂；与酸反应生成钡盐。' },
  AgCl: { name: '氯化银', phys: '白色固体，难溶于水和稀硝酸。', chem: '见光分解：2AgCl =[光照] 2Ag + Cl₂↑；由硝酸银溶液与氯离子反应生成，用于检验 Cl⁻。' },
  AgBr: { name: '溴化银', phys: '淡黄色固体，难溶于水。', chem: '见光分解，是照相感光材料；由硝酸银与溴离子反应生成。' },
  NH4NO3: { name: '硝酸铵', phys: '白色晶体，易溶于水，溶解时吸热。', chem: '与碱共热放出氨气：NH₄NO₃ + NaOH =[△] NaNO₃ + NH₃↑ + H₂O；受热或撞击可能爆炸，可作氮肥。' },
  NH4HCO3: { name: '碳酸氢铵', phys: '白色晶体，易溶于水，有氨味。', chem: '受热分解：NH₄HCO₃ =[△] NH₃↑ + H₂O + CO₂↑；与酸反应放出二氧化碳。' },
  '(NH4)2SO4': { name: '硫酸铵', phys: '白色晶体，易溶于水。', chem: '与碱共热放出氨气；常用氮肥，长期单独施用会让土壤变酸。' },
  'NH3·H2O': { name: '一水合氨（氨水）', phys: '无色有刺激性气味的液体，易挥发，显碱性。', chem: '弱碱，能使酚酞变红；受热分解：NH₃·H₂O =[△] NH₃↑ + H₂O；与酸反应生成铵盐。' },
  'CO(NH2)2': { name: '尿素', phys: '白色晶体，易溶于水，含氮量高的固体氮肥。', chem: '在土壤中被脲酶水解成碳酸铵后供作物吸收；与碱共热可放出氨气。' },
  NO: { name: '一氧化氮', phys: '无色气体，难溶于水，有毒。', chem: '极易与氧气化合：2NO + O₂ = 2NO₂；在空气中迅速变成红棕色，不溶于水，可用排水法收集。' },
  NO2: { name: '二氧化氮', phys: '红棕色有刺激性气味的气体，有毒，易溶于水。', chem: '与水反应：3NO₂ + H₂O = 2HNO₃ + NO；是形成酸雨和光化学烟雾的元凶之一。' },
  Si: { name: '硅', phys: '灰黑色有金属光泽的固体，硬而脆，是良好的半导体。', chem: '常温下很稳定，高温时与氧气、氯气反应：Si + O₂ =[△] SiO₂；用于芯片和太阳能电池。' },
  He: { name: '氦气', phys: '无色无味气体，密度很小，极难液化。', chem: '性质极不活泼，几乎不参与化学反应；用于飞艇、气球和低温超导。' },
  Ne: { name: '氖气', phys: '无色无味气体，密度比空气略小。', chem: '极不活泼；通电发出橙红色光，用于霓虹灯。' },
  Ar: { name: '氩气', phys: '无色无味气体，密度比空气大。', chem: '极不活泼；用作焊接保护气和灯泡填充气，防止金属被氧化。' },
  Hg: { name: '汞', phys: '常温下唯一呈液态的金属，银白色，有毒，俗称水银。', chem: '与硫粉研磨生成硫化汞：Hg + S = HgS；蒸气有毒，洒落要用硫粉覆盖处理。' },
  HgO: { name: '氧化汞', phys: '红色或黄色固体，难溶于水。', chem: '受热分解：2HgO =[△] 2Hg + O₂↑，是历史上制氧气的经典反应。' },
  C2H4: { name: '乙烯', phys: '无色稍有气味的气体，难溶于水，密度与空气相近。', chem: '可燃，火焰明亮并带黑烟；能使溴水和酸性高锰酸钾溶液褪色；能加聚成聚乙烯。' },
  C2H2: { name: '乙炔', phys: '无色无味气体（电石法制的常带臭味），微溶于水。', chem: '可燃，氧炔焰温度很高用于焊接切割金属；能使溴水褪色，能加成生成乙醛等。' },
  CH3OH: { name: '甲醇', phys: '无色易挥发液体，有毒，能与水以任意比互溶。', chem: '可燃：2CH₃OH + 3O₂ =[点燃] 2CO₂ + 4H₂O；可被氧化成甲醛，误饮会失明甚至致死。' },
  C12H22O11: { name: '蔗糖', phys: '白色晶体，易溶于水，有甜味。', chem: '水解生成葡萄糖和果糖：C₁₂H₂₂O₁₁ + H₂O =[稀硫酸] C₆H₁₂O₆ + C₆H₁₂O₆；是主要的食用糖。' },
  C6H6: { name: '苯', phys: '无色有特殊气味的液体，有毒，不溶于水，密度比水小。', chem: '可燃，火焰明亮带浓烟；易发生取代反应，难加成难氧化，能使溴水因萃取而分层褪色。' },
  'KAl(SO4)2·12H2O': { name: '十二水硫酸铝钾（明矾）', phys: '无色晶体，易溶于水，水溶液呈酸性。', chem: '水解生成氢氧化铝胶体，能吸附悬浮杂质使水澄清；与小苏打反应产生二氧化碳，可作灭火剂。' },
  Na2SiO3: { name: '硅酸钠', phys: '白色固体，可溶于水，水溶液俗称水玻璃，黏稠。', chem: '水溶液呈碱性；与盐酸反应生成硅酸：Na₂SiO₃ + 2HCl = 2NaCl + H₂SiO₃↓；常用作黏合剂和防火材料。' },
  CaC2: { name: '碳化钙（电石）', phys: '灰黑色固体，遇水剧烈反应并放出气体。', chem: 'CaC₂ + 2H₂O = Ca(OH)₂ + C₂H₂↑，是制乙炔的原料；含杂质时产生的气体有臭味。' },
  // ---- 离子（明轩 2026-10-30：二价铁离子查不到，离子必须进速查表）----
  'Fe2+': { name: '亚铁离子 Fe²⁺', phys: '水溶液呈浅绿色，只在酸性或中性溶液里稳定，见光、遇氧都容易变质。', chem: '还原性明显，能被氯水、氧气、酸性高锰酸钾氧化成 Fe³⁺：2Fe²⁺ + Cl₂ = 2Fe³⁺ + 2Cl⁻。与 OH⁻ 生成白色 Fe(OH)₂ 沉淀，随即变灰绿，最终变红褐色 Fe(OH)₃；与 K₃[Fe(CN)₆] 生成蓝色沉淀，可用来检验它。' },
  'Fe3+': { name: '铁离子 Fe³⁺', phys: '水溶液呈棕黄色，酸性溶液中稳定，pH 升高会水解生成红褐色胶体。', chem: '有氧化性，能氧化 Fe、Cu、I⁻：2Fe³⁺ + Cu = 2Fe²⁺ + Cu²⁺。与 OH⁻ 生成红褐色 Fe(OH)₃ 沉淀；与 KSCN 溶液变血红色，是检验 Fe³⁺ 的常用方法。' },
  'Cu2+': { name: '铜离子 Cu²⁺', phys: '水溶液呈蓝色，浓度大时偏蓝绿。', chem: '与 OH⁻ 生成蓝色 Cu(OH)₂ 沉淀，加热分解成黑色 CuO；能被铁、锌等活泼金属置换：Fe + Cu²⁺ = Fe²⁺ + Cu。' },
  'Al3+': { name: '铝离子 Al³⁺', phys: '无色，水溶液中易水解，显酸性。', chem: '与少量 OH⁻ 生成白色 Al(OH)₃ 沉淀，OH⁻ 过量时沉淀溶解成 AlO₂⁻，是两性的典型；与氨水只生成沉淀不溶解。' },
  'Zn2+': { name: '锌离子 Zn²⁺', phys: '无色，水溶液稳定。', chem: '与 OH⁻ 生成白色 Zn(OH)₂ 沉淀，OH⁻ 过量也会溶解；能被镁、铝等更活泼的金属置换。' },
  'Mg2+': { name: '镁离子 Mg²⁺', phys: '无色，水溶液稳定。', chem: '与 OH⁻ 生成白色 Mg(OH)₂ 沉淀，不溶于过量碱；焰色反应无色，常用来区分钙、钡。' },
  'Ca2+': { name: '钙离子 Ca²⁺', phys: '无色，是硬水的主要成分之一。', chem: '与 CO₃²⁻ 生成白色 CaCO₃ 沉淀，加盐酸会溶解并放出 CO₂；焰色反应呈砖红色。' },
  'Ba2+': { name: '钡离子 Ba²⁺', phys: '无色，可溶钡盐有毒。', chem: '与 SO₄²⁻ 生成不溶于酸的白色 BaSO₄ 沉淀，是检验硫酸根的经典方法；焰色反应呈黄绿色。' },
  'Na+': { name: '钠离子 Na⁺', phys: '无色，是细胞外液的主要阳离子。', chem: '焰色反应呈黄色；与绝大多数阴离子形成的盐都易溶，只有少数如 Na[Sb(OH)₆] 难溶。' },
  'K+': { name: '钾离子 K⁺', phys: '无色，是细胞内液的主要阳离子。', chem: '焰色反应呈紫色，需透过蓝色钴玻璃观察以滤掉钠的黄光。' },
  'Ag+': { name: '银离子 Ag⁺', phys: '无色，见光易分解，需避光保存。', chem: '与 Cl⁻ 生成白色 AgCl 沉淀，不溶于稀硝酸；与 Br⁻ 生成淡黄色、与 I⁻ 生成黄色沉淀，可用来区分卤素离子。' },
  'H+': { name: '氢离子 H⁺', phys: '溶液中实际以 H₃O⁺ 形式存在，决定溶液的酸性。', chem: '与活泼金属反应放出氢气；与 OH⁻ 中和；与 CO₃²⁻、HCO₃⁻ 反应放出 CO₂。' },
  'NH4+': { name: '铵根离子 NH₄⁺', phys: '无色，只存在于酸性或中性溶液中。', chem: '与 OH⁻ 共热放出有刺激性气味的氨气：NH₄⁺ + OH⁻ =[△] NH₃↑ + H₂O，是检验铵根的方法，也是铵态氮肥不能与碱性物质混用的原因。' },
  'OH-': { name: '氢氧根离子 OH⁻', phys: '使溶液显碱性，能使石蕊变蓝、酚酞变红。', chem: '与酸中和生成水；与多数金属阳离子生成氢氧化物沉淀，其中 Al(OH)₃、Zn(OH)₂ 能溶于过量强碱。' },
  'SO42-': { name: '硫酸根离子 SO₄²⁻', phys: '无色，硫酸盐大多易溶。', chem: '与 Ba²⁺ 生成不溶于稀硝酸的白色 BaSO₄ 沉淀，这是检验 SO₄²⁻ 的标准方法；检验前要先加盐酸排除 CO₃²⁻、SO₃²⁻ 的干扰。' },
  'CO32-': { name: '碳酸根离子 CO₃²⁻', phys: '水溶液显碱性，碳酸盐中只有钾、钠、铵盐可溶。', chem: '与 H⁺ 反应放出 CO₂：CO₃²⁻ + 2H⁺ = H₂O + CO₂↑；与 Ca²⁺、Ba²⁺ 生成白色沉淀，加盐酸后沉淀溶解并冒气泡。' },
  'HCO3-': { name: '碳酸氢根离子 HCO₃⁻', phys: '水溶液显弱碱性，受热易分解。', chem: '与 H⁺ 反应放出 CO₂；与 OH⁻ 反应生成 CO₃²⁻ 和水；加热分解：2HCO₃⁻ =[△] CO₃²⁻ + H₂O + CO₂↑。' },
  'NO3-': { name: '硝酸根离子 NO₃⁻', phys: '无色，硝酸盐大多易溶。', chem: '在酸性条件下有强氧化性，与铜反应放出 NO 或 NO₂；中性、碱性溶液中氧化性很弱。' },
  'PO43-': { name: '磷酸根离子 PO₄³⁻', phys: '无色，磷酸盐中只有钾、钠、铵盐可溶。', chem: '与 Ag⁺ 生成黄色 Ag₃PO₄ 沉淀，可区别于白色的 AgCl；与 Ca²⁺ 生成难溶的磷酸钙。' },
  'MnO4-': { name: '高锰酸根离子 MnO₄⁻', phys: '水溶液呈紫红色，颜色深浅可粗略判断浓度。', chem: '酸性条件下氧化性很强，自身被还原成无色的 Mn²⁺，可氧化 Fe²⁺、Cl⁻、草酸等；中性或碱性条件下被还原成褐色的 MnO₂。' },
  'Cl-': { name: '氯离子 Cl⁻', phys: '无色，氯化物大多易溶，AgCl 例外。', chem: '与 Ag⁺ 生成白色 AgCl 沉淀，不溶于稀硝酸，是检验 Cl⁻ 的方法；浓盐酸中与 MnO₂ 共热可放出氯气。' },
  'Br-': { name: '溴离子 Br⁻', phys: '无色，水溶液稳定。', chem: '与 Ag⁺ 生成淡黄色 AgBr 沉淀；能被氯气氧化成 Br₂：2Br⁻ + Cl₂ = Br₂ + 2Cl⁻。' },
  'I-': { name: '碘离子 I⁻', phys: '无色，易被空气氧化，久置溶液会发黄。', chem: '还原性强，能被氯气、Fe³⁺ 氧化成 I₂，遇淀粉变蓝；与 Ag⁺ 生成黄色 AgI 沉淀。' },
  'F-': { name: '氟离子 F⁻', phys: '无色，氟化物中 AgF 可溶，CaF₂ 难溶。', chem: '与 Ca²⁺ 生成白色 CaF₂ 沉淀；能腐蚀玻璃（与 SiO₂ 反应），所以氢氟酸要装在塑料瓶里。' },
  'S2-': { name: '硫离子 S²⁻', phys: '无色，水溶液显强碱性，遇酸放出臭鸡蛋味的硫化氢。', chem: '还原性强，能被氧化成单质硫甚至 SO₄²⁻；与 Cu²⁺、Pb²⁺ 生成黑色硫化物沉淀。' },
  'ClO-': { name: '次氯酸根离子 ClO⁻', phys: '只存在于溶液中，本身无色，具漂白性。', chem: '强氧化性，能漂白、杀菌；遇酸生成次氯酸：ClO⁻ + H⁺ = HClO；与还原性离子不能大量共存。' },
  'SO32-': { name: '亚硫酸根离子 SO₃²⁻', phys: '只存在于溶液中，无色。', chem: '还原性明显，能被氧气、氯水、高锰酸钾氧化成 SO₄²⁻；与酸反应放出 SO₂↑；与 Ba²⁺ 生成白色沉淀，沉淀溶于稀盐酸。' },
  'SCN-': { name: '硫氰酸根离子 SCN⁻', phys: '只存在于溶液中，无色。', chem: '与 Fe³⁺ 结合生成血红色溶液，是检验 Fe³⁺ 的经典方法；与 Ag⁺ 生成白色沉淀。' },
  'CrO42-': { name: '铬酸根离子 CrO₄²⁻', phys: '水溶液呈黄色，在碱性条件下稳定。', chem: '酸化后转化为橙红色的 Cr₂O₇²⁻；与 Ba²⁺、Pb²⁺ 生成难溶的黄色沉淀。' },
  'HSO4-': { name: '硫酸氢根离子 HSO₄⁻', phys: '只存在于溶液中，无色。', chem: '在水溶液中完全电离成 H⁺ 和 SO₄²⁻，因此显强酸性；与 Ba²⁺ 生成白色沉淀。' },
  'Cr2O72-': { name: '重铬酸根离子 Cr₂O₇²⁻', phys: '水溶液呈橙红色，酸性条件下稳定。', chem: '酸性溶液中氧化性很强，自身被还原成绿色的 Cr³⁺，常用于检验酒精（变色后呈绿色）。' },
};


// 速查表里存的是老的长句，弹框只要关键两三句：按分句边界截，宁短不长
function brief(text, max) {
  let s = String(text || '').trim();
  if (!s || s.length <= max) return s;
  // 先按分句切，能塞几句塞几句，超了就停在上一句，不留半句话
  const groups = s.split(/[；;]/).map(x => x.trim()).filter(Boolean);
  let out = '';
  for (const g of groups) {
    const next = out ? `${out}；${g}` : g;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  // 第一句本身就超长：按逗号继续切
  const parts = groups[0].split(/[，,]/);
  let head = '';
  for (const p of parts) {
    const next = head ? `${head}，${p}` : p;
    if (next.length > max) break;
    head = next;
  }
  return (head || parts[0] || '').slice(0, max);
}

const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

const STATE_RE = /(?:稀|浓|饱和|澄清|石灰)?(?:水溶液|溶液|气体|粉末|固体|晶体|蒸气|液体|块状|粉末状|浊液|悬浊液)/;

function normFormula(raw) {
  let s = String(raw || '');
  for (const [k, v] of Object.entries(SUB)) s = s.split(k).join(v);
  s = s.replace(/[−–—]/g, '-').replace(/[\s\u00a0]/g, '');
  s = s.replace(/^\d+(?=[A-Z(])/, ''); // 去掉配平系数
  s = s.replace(/[↑↓]/g, '');
  return s;
}

function cleanState(raw) {
  const s = String(raw || '').replace(/[^\u4e00-\u9fa5]/g, '');
  const m = s.match(STATE_RE);
  return m ? m[0] : '';
}

// Na2O2 → Na₂O₂，电荷写成上标
function pretty(formula) {
  return String(formula || '')
    .replace(/\^?(\d?)([+-])/g, (m, n, sg) => `${n ? n.replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]) : ''}${sg === '+' ? '⁺' : '⁻'}`)
    .replace(/(?<=[A-Za-z)\]])(\d+)/g, (m, n) => n.replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]));
}

const SYSTEM_EN = [
  'You are a middle-school chemistry teacher. The user gives a chemical formula, maybe with a state word (solution, powder, gas, solid).',
  'Be brief. Output one JSON object only, no code fence, no explanation:',
  '{"name":"English name","phys":"physical properties, 12-28 words: colour, smell, state, solubility; say toxic if it is","chem":"chemical properties, 18-40 words: what it reacts with, and what it gives if that is the exam point; at most one equation","note":"a short note about that state, under 12 words; empty string if none"}',
  'No essays, no uses, no long lists. Only the substance that really matches this formula; never invent a reaction.',
].join('\n');

const SYSTEM = [
  '你是一个中学化学老师，说话很省。用户给出一个化学式（可能附状态词）。',
  '只输出一个 JSON 对象，不要代码块、不要解释：',
  '{"name":"物质的中文名","phys":"物理性质，20~45字，只写颜色、气味、状态、溶解性；有毒就写「有毒」，不展开","chem":"化学性质，30~70字，只写能与什么反应；考点相关的可以写生成什么；最多一个方程式，用 = 和 ↑↓","note":"这种状态的补充说明，20字内；没有就给空字符串"}',
  '别写推断过程、别写用途科普、别列一大串；一句话说完就停。只写这个式子真实对应的物质，不确定的不写，绝不编造。',
].join('\n');

function stripFence(t) {
  return String(t || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// JSON 被截断（token 用光）时按字段硬抠：宁可少一句，也别让整张卡变成「没查到」
function looseFields(txt) {
  const pick = (k) => {
    const m = String(txt || '').match(new RegExp(`"${k}"\\s*:\\s*"([\\s\\S]*?)(?:"\\s*[,}]|"\\s*$|$)`));
    if (!m) return '';
    return m[1].replace(/\\n|\\r/g, ' ').replace(/\\"/g, '"').trim();
  };
  const out = { name: pick('name'), phys: pick('phys'), chem: pick('chem'), note: pick('note') };
  return (out.name || out.phys || out.chem) ? out : null;
}

function parseJson(t) {
  const s = stripFence(t);
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; }
}

async function askModel(env, formula, state, lang) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const ctrl = new AbortController();
  const guard = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, 11000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: lang === 'en' ? SYSTEM_EN : SYSTEM },
          { role: 'user', content: lang === 'en'
            ? `Formula: ${formula}${state ? `; state: ${state}` : ''}`
            : `化学式：${formula}${state ? `；状态：${state}` : ''}` },
        ],
        temperature: 0.2,
        max_tokens: 420,
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const d = await res.json();
    const txt = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    const j = parseJson(txt) || looseFields(txt);
    if (!j) return null;
    const out = {
      name: String(j.name || '').trim().slice(0, 24),
      phys: String(j.phys || '').trim().slice(0, 120),
      chem: String(j.chem || '').trim().slice(0, 180),
      note: String(j.note || '').trim().slice(0, 60),
    };
    if (!out.name || (!out.phys && !out.chem)) return null;
    // 只剩半句话（被截断/模型偷懒）就不算查到了，交给前端重试
    if (out.phys && out.phys.length < 8 && (!out.chem || out.chem.length < 8)) return null;
    return out;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(guard);
  }
}

export async function handleChem(request, env, ctx) {
  const cors = corsHeaders(env);
  const url = new URL(request.url);
  const formula = normFormula(url.searchParams.get('f')).slice(0, 40);
  const state = cleanState(url.searchParams.get('s'));
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
  if (!formula || !/^[A-Za-z0-9()[\]{}·.:+\-^]{1,40}$/.test(formula)) {
    return json({ error: 'invalid_formula' }, 400, cors);
  }

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = cache
    ? new Request(`https://minxtok.local/chem/v5/${lang}/${encodeURIComponent(formula)}/${encodeURIComponent(state)}`)
    : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const d = await hit.json().catch(() => null);
      if (d && d.ok) return json(d, 200, { ...cors, 'Cache-Control': 'private, max-age=86400' });
    }
  }

  // 英文界面不走中文速查表，直接让模型用英文写一份
  const hit = lang === 'zh' ? (TABLE[formula] || null) : null;
  let data = hit
    ? { name: hit.name, phys: brief(String(hit.phys || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, ''), 34), chem: brief(hit.chem, 58), note: '' }
    : await askModel(env, formula, state, lang);
  // 一次没成再问一次：Workers AI 偶发抖动，不该让整张卡停在「没连上」
  if (!data && !hit) data = await askModel(env, formula, state, lang);
  if (!data) data = { name: formula, phys: '', chem: '', note: '' };

  const payload = {
    ok: !!(data.phys || data.chem),
    formula,
    lang,
    display: pretty(formula),
    state,
    name: data.name || formula,
    phys: data.phys || '',
    chem: data.chem || '',
    note: data.note || '',
  };

  if (cache && payload.ok) {
    const res = json(payload, 200, { ...cors, 'Cache-Control': 'private, max-age=86400' });
    const copy = new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
    const put = cache.put(key, copy).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
    return res;
  }
  return json(payload, 200, { ...cors, 'Cache-Control': 'private, max-age=3600' });
}
