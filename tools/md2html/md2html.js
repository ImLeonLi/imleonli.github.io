/**
 * md2html.js — Markdown 转 HTML（LaTeX 公式渲染为内嵌 PNG 图片）
 * 用法: node md2html.js <input.md> [output.html]
 * 
 * 公式用 MathJax v3 渲染为 SVG → sharp 转 PNG → base64 内嵌 <img>
 * 不依赖外部 JS/CSS/字体/图片，复制粘贴到公众号可直接显示。
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const sharp = require('sharp');
const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

// 初始化 MathJax
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: 'none' }); // 不用外部字体缓存
const htmlDoc = mathjax.document('', { InputJax: tex, OutputJax: svgOutput });

// 渲染 LaTeX 为 SVG 字符串
function renderMathToSVG(latex, displayMode) {
  try {
    const wrapped = displayMode ? `\\displaystyle{${latex}}` : latex;
    const node = htmlDoc.convert(wrapped, { display: displayMode });
    return adaptor.innerHTML(node);
  } catch (e) {
    console.error(`公式 SVG 渲染失败: ${latex.substring(0, 50)}...`);
    console.error(e.message);
    return null;
  }
}

// SVG 转 base64 PNG
async function svgToBase64PNG(svgStr, scale = 3) {
  try {
    // 确保 SVG 有 xmlns
    if (!svgStr.includes('xmlns=')) {
      svgStr = svgStr.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }

    const svgBuf = Buffer.from(svgStr);
    const metadata = await sharp(svgBuf).metadata();
    const origW = metadata.width || 100;
    const origH = metadata.height || 30;
    const targetW = Math.round(origW * scale);
    const targetH = Math.round(origH * scale);

    const pngBuf = await sharp(svgBuf)
      .resize(targetW, targetH, { kernel: 'nearest' })
      .png()
      .toBuffer();

    return {
      base64: pngBuf.toString('base64'),
      width: origW,
      height: origH,
    };
  } catch (e) {
    console.error(`SVG→PNG 转换失败: ${e.message}`);
    return null;
  }
}

// ============ 主逻辑 ============

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('用法: node md2html.js <input.md> [output.html]');
    process.exit(1);
  }

  const inputPath = path.resolve(inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const md = fs.readFileSync(inputPath, 'utf-8');

  // 去掉 Jekyll Front Matter
  let content = md.replace(/^---[\s\S]*?---\n*/, '');

  // 第一步：提取所有公式，用占位符替换，避免 Markdown 解析器破坏公式
  const mathBlocks = [];
  let counter = 0;

  // 提取 $$...$$ (display math)
  content = content.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
    const id = `%%MATH_BLOCK_${counter++}%%`;
    mathBlocks.push({ id, formula: formula.trim(), display: true });
    return id;
  });

  // 提取 $...$ (inline math)
  content = content.replace(/\$([^\$\n]+?)\$/g, (_, formula) => {
    const id = `%%MATH_INLINE_${counter++}%%`;
    mathBlocks.push({ id, formula: formula.trim(), display: false });
    return id;
  });

  // 第二步：Markdown 转 HTML
  const htmlBody = marked(content);

  // 第三步：渲染公式为 SVG → PNG → base64 <img>
  console.log(`正在渲染 ${mathBlocks.length} 个公式为 PNG 图片...`);
  let finalHtml = htmlBody;

  for (const block of mathBlocks) {
    const svgStr = renderMathToSVG(block.formula, block.display);
    if (!svgStr) {
      finalHtml = finalHtml.replace(block.id, `<code style="color:red;">[公式错误]</code>`);
      continue;
    }

    const scale = block.display ? 3 : 3; // 3x 渲染，保证清晰
    const pngData = await svgToBase64PNG(svgStr, scale);
    if (!pngData) {
      finalHtml = finalHtml.replace(block.id, `<code style="color:red;">[图片转换失败]</code>`);
      continue;
    }

    const imgTag = block.display
      ? `<div style="text-align:center;margin:1em 0;"><img src="data:image/png;base64,${pngData.base64}" alt="公式" style="max-width:100%;height:auto;border:none;vertical-align:middle;" /></div>`
      : `<img src="data:image/png;base64,${pngData.base64}" alt="公式" style="height:1.2em;vertical-align:middle;border:none;display:inline;" />`;

    finalHtml = finalHtml.replace(block.id, imgTag);
    process.stdout.write('.');
  }

  console.log(' 完成');

  // 第四步：读取自定义 CSS
  const scriptDir = __dirname;
  const cssPath = path.join(scriptDir, 'pandoc-style.css');
  let customCSS = '';
  if (fs.existsSync(cssPath)) {
    customCSS = fs.readFileSync(cssPath, 'utf-8');
  }

  // 组装完整 HTML
  const fullHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <style>
img { max-width: 100%; }
${customCSS}
  </style>
</head>
<body>
${finalHtml}
</body>
</html>`;

  // 输出路径
  const outputPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : inputPath.replace(/\.md$/, '.html');

  fs.writeFileSync(outputPath, fullHTML, 'utf-8');
  const sizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`转换完成: ${path.basename(outputPath)} (${sizeKB} KB)`);
}

main().catch(e => {
  console.error('转换出错:', e);
  process.exit(1);
});
