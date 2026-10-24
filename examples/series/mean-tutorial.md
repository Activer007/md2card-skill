<!-- card: {"template":"T18","density":"compact","eyebrow":"FIELDNOTES / 均值练习","source":"原创 JavaScript · 三条耗时均为虚构数据"} -->
# 先算三条记录

三条耗时为 120、180、150 毫秒；本例只求它们的算术平均值。

## 运行：逐项累加

```js
const ms = [120, 180, 150];
let sum = 0;
for (const n of ms) sum += n;
console.log(sum / ms.length);
```

## 结果：输出 150

分母为 3 条记录。结果不是实际性能测量，也不代表更大的样本。

===

<!-- card: {"template":"T18","density":"compact","eyebrow":"FIELDNOTES / 均值练习","source":"原创 JavaScript · 输入限有限非负数，单位毫秒"} -->
# 空输入不冒充零

把计算包成函数；没有记录时返回 null，而不是声称耗时为零。

## 定义：保留缺失状态

```js
function mean(ms) {
  if (!ms.length) return null;
  let sum = 0;
  for (const n of ms) sum += n;
  return sum / ms.length;
}
```

## 检查：调用后看返回值

mean([]) 返回 null；mean([120, 180, 150]) 返回 150。函数本身不打印结果。

===

<!-- card: {"template":"T17","density":"compact","eyebrow":"FIELDNOTES / 均值练习","source":"原创边界说明 · 不含真实系统性能结论"} -->
# 算对，还要用对

前两张代码只是教学计算，不是完整的数据清洗或性能分析工具。

## 输入边界

只传有限非负数，统一用毫秒；字符串和缺失值须先单独处理。

## 数值边界

示例未防止累加溢出。真实输入需约束数量与大小，并核对计算结果。

## 解释边界

均值不能揭示全部波动；不要把三条虚构记录推广为真实系统表现。
