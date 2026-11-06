# Math 计算器模块重构说明

## 架构设计

采用**策略模式 + 责任链模式**，实现模块化、可扩展的计算器架构。

### 核心组件

```
ICalculator (接口)
    ↓
├── MathCalculator (数学计算器)
├── DateCalculator (日期计算器)
└── [未来可扩展更多计算器]
    ↓
CalculatorFactory (工厂类)
    ↓
MathParagraphHandler (处理器)
```

## 文件结构

```
calculators/
├── ICalculator.ts          # 计算器接口定义
├── MathCalculator.ts       # 纯数学计算器
├── CalculatorFactory.ts    # 计算器工厂（责任链）
└── index.ts                # 模块导出

utils/
└── DateCalculator.ts       # 日期计算器（实现 ICalculator）
```

## 功能特性

### 1. MathCalculator（纯数学计算）

#### 基础运算
- 四则运算：`1 + 2 * 3` → `7`
- 幂运算：`2^8` → `256`
- 括号优先级：`(1 + 2) * 3` → `9`

#### 数学函数
- 三角函数：`sin(pi/2)` → `1`、`cos(0)` → `1`
- 指数对数：`sqrt(16)` → `4`、`log(100)` → `2`
- 其他函数：`abs(-5)` → `5`、`ceil(4.3)` → `5`

#### 单位转换（Math.js 原生支持）
✅ **长度单位**
- `1ft + 12in` → `2 ft`
- `5 meters to cm` → `500 cm`
- `100 km to mi` → `62.137 mi`

✅ **速度单位**
- `20 mi / 4 hr to m/s` → `2.2352 m/s`
- `100 km/hr in mi/hr` → `62.137 mi/hr`
- `60 km/h to m/s` → `16.667 m/s`

✅ **物理计算**
- `9.81 m/s^2 * 100 kg * 40 m` → `39.24 kJ`（能量计算）
- `80 mi/h * 2 tonne` → 动能计算

✅ **支持的单位类型**
- **长度**：m, cm, mm, km, ft, inch, mile, yard
- **质量**：g, kg, tonne, pound, ounce
- **时间**：s, min, hour, day, week, month, year
- **速度**：m/s, km/h, mi/h
- **力**：N, kN
- **能量**：J, kJ, MJ, cal, kcal
- **功率**：W, kW, MW
- **温度**：K, degC, degF（注意：温度计算建议用 K）
- **角度**：rad, deg
- 更多单位请参考 [Math.js Units 文档](https://mathjs.org/docs/datatypes/units.html)

#### 科学计数
- `1.23e5` → `123000`
- `6.022e23` → 阿伏伽德罗常数

#### 自动格式化
- 自动识别整数：`2.0000001` → `2`
- 保留 6 位小数：`1/3` → `0.333333`
- 过滤无效输入（如单独的函数名 `sin`）

### 2. DateCalculator（日期计算）
- 日期加减：`"2024-01-01" + 7 days` → `2024-01-08`
- 日期差值：`"2024-01-01" 到 今天` → `X年X个月X天（共X天）`
- 相对日期：`今天`、`明天`、`昨天`、`后天`、`前天`
- 支持单位：天、周、月、年、小时、分钟

## 使用示例

### 在思源笔记中使用

1. **创建 Math 段落块**
   - 输入任意文本
   - 使用快捷键或菜单设置 `custom-block-type="math"`

2. **输入表达式**
   ```
   数学计算：2 + 2
   单位转换：100 km/hr in mi/hr
   日期计算："2024-01-01" + 30 days
   物理计算：9.81 m/s^2 * 100 kg * 40 m
   ```

3. **查看结果**
   - 结果会自动通过 CSS 伪元素显示在右侧
   - 支持实时更新

### 在 MathParagraphHandler 中使用

```typescript
import { CalculatorFactory } from '../calculators/CalculatorFactory';

// 初始化
CalculatorFactory.initialize();

// 基础计算
const result1 = CalculatorFactory.calculate('2 + 2');  // "4"

// 单位转换
const result2 = CalculatorFactory.calculate('100 km/hr in mi/hr');  // "62.137 mi/hr"

// 日期计算
const result3 = CalculatorFactory.calculate('"2024-01-01" + 7 days');  // "2024-01-08"

// 物理计算
const result4 = CalculatorFactory.calculate('9.81 m/s^2 * 100 kg * 40 m');  // "39.24 kJ"
```

## 扩展新计算器

### 示例：添加货币计算器

如果需要添加货币转换功能（注：Math.js 也支持货币，但需要自定义汇率）：

1. 创建新类实现 `ICalculator` 接口：

```typescript
import { ICalculator } from './ICalculator';

export class CurrencyCalculator implements ICalculator {
  canHandle(expression: string): boolean {
    // 判断是否包含货币符号
    return /[$£¥€]/.test(expression);
  }

  calculate(expression: string): string {
    // 实现货币计算逻辑
    // 示例：$100 + $50 = $150
    return result;
  }
}
```

2. 在 `CalculatorFactory` 中注册：

```typescript
this.calculators = [
  new DateCalculator(),      // 日期计算器（最高优先级）
  new CurrencyCalculator(),  // 货币计算器（新增）
  new MathCalculator(),      // 数学计算器（通用兼底）
];
```

### 为什么不需要单独的单位计算器？

✅ **Math.js 已经原生支持单位转换**
- 长度、质量、时间、速度、力、能量等所有常见物理单位
- 支持单位运算和转换：`to`、`in` 关键字
- 支持复杂物理计算：`m/s^2 * kg * m = J`

✅ **当前 `MathCalculator` 已经包含所有单位功能**
- 无需额外开发
- 直接使用即可

## 优势

✅ **模块化**：每个计算器独立实现，职责单一  
✅ **可扩展**：新增计算器只需实现接口  
✅ **健壮性**：统一的错误处理和结果过滤  
✅ **简洁性**：Handler 代码从 167 行减少到 96 行  
✅ **可测试**：每个计算器可独立测试  

## 测试用例

### 基础数学计算
- `2 + 2` → `4`
- `sqrt(16)` → `4`
- `pi * 2` → `6.283185`
- `pow(2, 8)` → `256`
- `sin(pi/2)` → `1`
- `sin` → `` (过滤单独函数名)

### 单位转换（✅ 已支持）
- `1ft + 12in` → `2 ft`
- `20 mi / 4 hr to m/s` → `2.2352 m/s`
- `100 km/hr in mi/hr` → `62.137 mi/hr`
- `9.81 m/s^2 * 100 kg * 40 m` → `39.24 kJ`
- `5 meters to cm` → `500 cm`
- `60 km/h to m/s` → `16.667 m/s`

### 日期计算
- `"2024-01-01" + 7 days` → `2024-01-08`
- `"2024-12-31" - 7 days` → `2024-12-24`
- `"2024-01-01" 到 今天` → `X年X个月X天（共X天）`
- `今天 + 1 天` → `明天的日期`
