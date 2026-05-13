---
layout: post
title: "Qwen-VL 系列技术梳理：从 Qwen-VL 到 Qwen2.5-VL"
date: 2025-12-01 00:00:00 +0800
tags: [Qwen, Qwen-VL, 多模态, LLM, 视觉语言模型]
category: 技术分享
---

> **转载声明**
>
> 本文转载自知乎专栏，原作者：**姜富春**
>
> 原文链接：[https://zhuanlan.zhihu.com/p/25267823390](https://zhuanlan.zhihu.com/p/25267823390)
>
> 转载已获得原作者授权，仅供学习交流使用。

---

# Qwen-VL 系列技术梳理：从 Qwen-VL 到 Qwen2.5-VL

## 1. 引言

最近两年随着 LLM 爆发式的发展，以 LLM 为主体框架的模型逐渐渗透到 CV、语音、智驾等多领域，并成为各领域的顶流，效果纷纷超越了一些传统的模型。本人最近在系统梳理多模态的技术栈，梳理的路线也是主要沿着基于 LLM 的多模态技术进行学习。整理过程中，试了一些模型效果，结果被 Qwen2.5-VL 的效果惊艳到了，索性就想沿着 Qwen-VL 系列缕清楚整体技术脉络。

> 本篇文章主要是基于几篇论文做技术整理，**源码解读可详见：[姜富春：Qwen2-VL 源码解读：从准备一条样本到模型生成全流程图解](https://zhuanlan.zhihu.com/p/28205969434)**

在梳理 Qwen-VL 系列前，我们先以更通用的视角简单了解下基于 LLM 的多模态模型的设计框架，方便我们先了解下业界通用的做法，也了解一些基本的概念。

在 [MM-LLMs 综述](https://arxiv.org/pdf/2401.13601) 一文中，总结了多模态大语言模型的通用模型框架和每个模块的一些实现方法，如图 1 所示：

![图1、多模态大语言模型（MM-LLMs）的通用实现框架](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig1-mm-llm-framework.jpg)
*图1、多模态大语言模型（MM-LLMs）的通用实现框架*

从图 1 中，我们可以看到，在通用的 MM-LLM（Multi-Modality LLM）框架里，共有五个模块，整体以 LLM 为核心主干，分别在前后有一个输入、输出的投影模块（Projector），投影模块主要是用于桥接不同模态输入和输出。输入投影模块（Input Projector）用于将模态编码器处理的不同模态特征映射到文本特征空间，以便输入给 LLM；输出投影模块（Output Projector）用于将文本特征空间结果映射到模态生成器的输入空间，以引导模态生成器生成多模态结果。五个模块按数据流顺序，具体描述如下：

- **模态编码器（Modality Encoder）**：将多模态的数据编码成向量空间特征，该模块通常是单独进行预训练的，典型的方法有基于 CNN 的 ResNET，基于 Transformer 的 ViT 等。
- **输入投影层（Input Projector）**：将模态编码器的输出映射到 LLM 的输入特征空间的适配层，一般模型结构比较简单，不同的多模态模型一般是随机初始化该模块的参数做冷启训练。典型的网络层：MLP，Cross-Attention 等
- **LLM 主干网络（LLM Backbone）**：LLM 是经过预训练的模型，一般还要串联多个模块继续做 Post-Pretrain 和微调，使得模型能识别多模态的特殊 token 和多模态的特征输入。
- **输出投影层（Output Projector）**：将 LLM 生成的数据，映射成 Modality Generator 可理解的特征空间，一般是简单的 Transformer 层或 MLP 层。
- **模态生成器（Modality Generator）**：多模态的生成器，最终输出多模态的结果如图像、语音、视频等。模型基本都是基于 LDM（Latent Diffusion Models）的衍生模型，如图片领域的 Stable Diffusion 方法。

一般这五个模块中，模态编码器，LLM 和模态生成器可以是基于大规模样本 Pretrain 好的模型，然后通过两个投影层，将各个模块串接起来。模型训练一般是通过预训练阶段充分训练 Projector 层，再按需精细化微调各模块，最终达到理想的端到端的模型效果。

在多模态场景，通常包括两类任务：理解任务 和 生成任务。对应的模型分别是**多模态理解模型**和**多模态生成模型**

- **多模态理解模型：** 主要包括前三个模块（模态编码器，输入投影层，LLM 主干网络），即模型接受多模态数据输入，以文本形式输出。
- **多模态生成模型：** 包括全部 5 个模块，即多模态数据输入，多模态数据输出，多模态生成模型通常要更复杂，也能难建模。

以上介绍完了通用的 MM-LLM 的框架。本文梳理的 **Qwen-VL 模型是一系列视觉+文本多模态理解模型**，即 LVLM(Large-scale Vision-Language Model)，主要处理文本和视觉特征，输入 Text、Image、Video，输出 Text。

目前 Qwen 共发布 3 个版本，分别为：Qwen-VL，Qwen2-VL，Qwen2.5-VL，共有 7 个不同尺寸的模型，如下表：

| 模型名 | 参数量 | 链接 |
|:------|:------|:-----|
| Qwen-VL | 9.6B | [https://huggingface.co/Qwen/Qwen-VL](https://huggingface.co/Qwen/Qwen-VL) |
| Qwen2-VL-2B | 2.2B | [https://huggingface.co/Qwen/Qwen2-VL-2B](https://huggingface.co/Qwen/Qwen2-VL-2B) |
| Qwen2-VL-7B | 8.3B | [https://huggingface.co/Qwen/Qwen2-VL-7B](https://huggingface.co/Qwen/Qwen2-VL-7B) |
| Qwen2-VL-72B | 73B | [https://huggingface.co/Qwen/Qwen2-VL-72B](https://huggingface.co/Qwen/Qwen2-VL-72B) |
| Qwen2.5-VL-3B | 3B | [https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct) |
| Qwen2.5-VL-7B | 8.3B | [https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct) |
| Qwen2.5-VL-72B | 73B | [https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct) |

> 注：上表只列出了几个主要的版本，并没有列出一些衍生版本的模型，Qwen 发布的模型还包括：量化、指令微调等模型版本

下面我们来详细看看 QwenVL 系列模型都做了哪些工作。

## 2. Qwen-VL

Qwen-VL 是以 Qwen-7B Base 为主干模型，通过引入视觉感知器（Visual receptor）来增强视觉特征的感知能力。视觉感知器包括一个跟语言模型对齐视觉编码器（visual encoder）和一个位置感知的适配器（position-aware adapter）。套用上面的通用多模态框架，Qwen-VL 包括了典型的前 3 个模块：

- **模态编码器（Modality Encoder）**：视觉编码器（visual encoder），只用来编码图片视觉特征
- **输入投影层（Input Projector）**：位置感知的适配器（position-aware adapter）
- **LLM 主干网络（LLM Backbone）**：Qwen-7B Base 模型

下面我们分别来看看 Qwen-VL 的两个核心模块：**视觉编码器、感知位置的适配器。** 接着描述一些规范化样本处理过程，最后描述下模型的训练过程。

### 2.1 视觉编码器（Visual Encoder）

Qwen-VL 的视觉编码器使用的是 ViT 架构（Vision Transformer），ViT 的网络设置和初始化参数使用了 OpenCLIP 预训练好的 ViT-bigG 模型。OpenCLIP 是 laion.ai 组织的一个开源项目，是对 OpenAI's 的 CLIP（Contrastive Language-image Pre-training）的开源实现。laion.ai 发布了一系列基于 CLIP 框架训练的不同 size 模型，同时他也为 CV 领域贡献了大量的开源数据，ViT-bigG 是经过了 2B 的训练数据训出来的 ViT 模型。

> 如果要进一步了解 **laion.ai, open_clip** 详见：
> - laion.ai 官网：[https://laion.ai/blog/giant-openclip/](https://laion.ai/blog/giant-openclip/)
> - huggingface 模型：[https://huggingface.co/laion/CLIP-ViT-bigG-14-laion2B-39B-b160k](https://huggingface.co/laion/CLIP-ViT-bigG-14-laion2B-39B-b160k)
> - 训练数据：[https://huggingface.co/datasets/laion/relaion2B-en-research-safe](https://huggingface.co/datasets/laion/relaion2B-en-research-safe)
> - open_clip：[https://github.com/mlfoundations/open_clip](https://github.com/mlfoundations/open_clip)

Qwen-VL 使用的 ViT(ViT-bigG) 是基于 CLIP 框架训练的，CLIP 是通过 Contrastive Learning 的方式来学习 Vision 和文本的表征。如下图 2（左图）所示，对于一个 Batch 的数据，以样本集中原始图文 pair `<I_i, T_i>` 为正例 pair，Batch 内与其他样本的 `I_x, T_x` 组成为负例 pair：`<I_i, T_x>, <I_x, T_i>` 其中 `i≠x`。模型训练采用了对比损失函数，通过最大化正例 Pair 的相似度，同时最小化负例 Pair 的相似度来训练模型。通过这种方式，能学习到视觉特征和文本特征的对齐关系。最后将训练好的 Image Encoder 模型（即 ViT）参数保存下来，以供其他下游任务热启使用。

![图2、CLIP 训练和推理阶框架图](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig2-clip.jpg)
*图2、CLIP 训练和推理阶框架图*

在 Qwen-VL 中采用的是标准的 ViT 框架，ViT 的原理比较简单：将图片分割成多个图像块（Patch），然后针对每个 Patch 通过一系列线性映射，转化成 token，再将所有 token 拼接成序列，最终将一张图片从 `(H,W,C)` 格式转换成 `(S,H)` 格式的序列特征。其中 H：高，W：宽，C：通道数，S：序列长度，H：特征维度。在标准的 ViT 实现上，输入图片会先被调整成长宽比 1：1 的正方形，然后再分割成固定的图像块。

因此这种标准的 ViT 框架的设计，只能接收固定分辨率的图片，同时 Patch 的大小也是模型在训练期间使用的一个固定 size。ViT 处理过程如图 3 所示：

![图3、标准 ViT 的处理流程](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig3-vit.jpg)
*图3、标准 ViT 的处理流程*

再结合 Qwen-VL 的源码理解 ViT 对图像的处理过程（源码详见：[https://huggingface.co/Qwen/Qwen-VL/blob/main/visual.py](https://huggingface.co/Qwen/Qwen-VL/blob/main/visual.py)）

> 首先看下源码设置的一些参数：
> - Qwen-VL 可接受的图像分辨率为 `448 × 448`，所以输入的图片会先处理成统一的尺寸：（W: 448, H: 448，C: 3）。注：Qwen-VL 模型训练其实是做了三个阶段，如下 2.4 节所述。第一阶段图像会统一处理成低像素：`224 × 224`，后面两个阶段统一分辨率为：`448 × 448`。这里只以高分辨率的设置为例。
> - patch_size: 14，这个参数指定 patch 的大小，同时也是卷积核 W 和 H 的尺寸，也是卷积操作的 stripe 步长
> - width：1664，这个参数指定的输出通道数，即 out_channels，也就是每个 Patch 输出的特征的维度
> - 我们以 batch_size(B) = 1 为例

ViT 核心处理就几行代码，如下：

```python
class VisionTransformer(nn.Module):
   def __init__(...):
       self.conv1 = nn.Conv2d(in_channels=3, out_channels=width, kernel_size=patch_size, stride=patch_size, bias=False)

   def forward(self, x: torch.Tensor):
        # 注释1：通过卷积核将一张图片从[H，W，C]=[448, 448, 3] 映射成 [width, grid, grid] = [1664, 32, 32]
        x = self.conv1(x)  # shape = [*, width, grid, grid]
        # 注释2：一张图片按行展开，[width, grid, grid] 映射成 [grid * grid, width]二维序列
        x = x.reshape(x.shape[0], x.shape[1], -1)  # shape = [*, width, grid ** 2]
        x = x.permute(0, 2, 1)  # shape = [*, grid ** 2, width]
        # 注释3：增加位置编码输入 transformer 模型
        x = x + get_abs_pos(self.positional_embedding, x.size(1))
        x = self.transformer(x)
```

以上述配置，图示化 ViT 的处理过程

**代码注释 1 的处理过程**：一张图片做卷积操作，处理成 `[width, grid, grid] = [1664, 32, 32]` 的数据，如图 4 所示。

![图4、ViT 源码卷积操作图示（nn.Conv2d）](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig4-vit-conv.jpg)
*图4、ViT 源码卷积操作图示（nn.Conv2d）*

**代码注释 2 的处理过程**：按行优先展开，处理成一个二维格式的数据 `[sequence_len, hidden_size] = [1024, 1664]`（类似于一条文本处理后的序列）。如图 5 所示。

![图5、ViT 源码格式化序列特征过程](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig5-vit-sequence.jpg)
*图5、ViT 源码格式化序列特征过程*

### 2.2 输入投影层：感知位置的视觉-语言适配器（Position-aware Vision-Language Adapter）

经过上述 ViT 处理后，对于 `448 × 448` 分辨率的图像，生成一个 `[1024, 1664]` 的序列，也就是向量维度为 1664 的长度为 1024 的序列。为了压缩视觉 token 的输入长度，Qwen-VL 引入了一个 Adapter 来压缩图像特征。这个 Adapter 就是一个随机初始化的单层 Cross-Attention 模块。该模块使用一组可学习的 query 向量，将来自 ViT 的图像特征作为 Key 向量。通过 Cross-Attention 操作后将视觉特征序列压缩到**固定的 256 长度**。

> 对于 Transformer 我们平时接触更多的是 Self-Attention，在 Self-Attention 计算中 q,k,v 都是基于输入特征做矩阵变换后得到的，通常 q,k,v 的长度处理前后也是一样的。
> 那么这里提到的 Cross-Attention、可学习的 query 向量、做序列压缩等，针对这些描述是否真正理解了呢？

为了清晰理解这块，我们还是用图来描述下，如图 6 所示：

![图6、Cross-Attention 特征向量压缩示意图](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig6-cross-attention.jpg)
*图6、Cross-Attention 特征向量压缩示意图*

上图描述了基于可学习 Query 和 ViT 输出的序列作为 k,v 的 Attention 计算过程，经过 Cross-Attention 后，将 ViT 阶段的 1024 长度的序列，压缩到了长度为 256 的序列。

此外，考虑到位置信息对于精细图像理解的重要性，Qwen-VL 将**二维绝对位置编码（三角位置编码）**整合到 Cross-Attention 的 q,k 中，以减少压缩过程中可能丢失的位置细节。随后将长度为 256 的压缩图像特征序列输入到大型语言模型中。

### 2.3 输入和输出

对于输入 LLM 前的特征序列，为了区分图片和文本的输入信息，对图片的 feature 使用了特殊的 token 包裹，图像特征的开始和结束用 `<img>` 和 `</img>` token 圈定，来明确标识图像特征的起止位置。同时为了做 grounding 任务，对图像中 bounding box 统一用一个"左上-右下"坐标框格式表示：`(X_{topleft},Y_{topleft}),(X_{bottomright},Y_{bottomright})`，坐标值统一做归一化处理，规范化到 `(0,1000)` 区间。并用 `<box>`、`</box>` 特殊 token 圈定。对于描述 bounding box 的文本，也用 `<ref>`、`</ref>` 两个特殊的 token 圈定起来。下面图 7 是一条典型的 grounding 任务的样本实例

![图7、多模态预训练的样本示例](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig7-sample.jpg)
*图7、多模态预训练的样本示例*

样本中的 demo.jpg：

![图8、demo.jpg](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig8-demo.jpg)
*图8、demo.jpg*

### 2.4 训练过程

Qwen-VL 共分成 3 个训练阶段，包括两个预训练阶段和一个 SFT 阶段。

**第一阶段：单任务大规模预训练（Pre-training）**，主要使用大量网上抓取和内部的图文 pair 数据做预训练，训练数据有 1.4B，英文数据占比 77.3%，中文占比 22.7%，训练数据的图片统一处理成 `224 × 224` 的尺寸。该阶段 LLM 模型参数是 frozen 的，ViT 和 Cross-Attention 层的参数是激活更新的，这个阶段主要通过大规模数据训练模型的 vision 模态对齐语言模型的能力。

**第二阶段：多任务预训练（Multi-task Pre-training）**，这个阶段使用了更高分辨率、更高质量的数据，同时引入图文混排的数据。该阶段是个多任务的预训练阶段，包括 7 个任务，其中有 6 个 Vision 任务（包括 Captioning，VQA，grounding 等）和 1 个文本生成任务，这个阶段模型是全参数激活的。该阶段之所以引入文本生成任务，主要是为了保证模型的通用文本处理能力。该阶段的训练数据，Vision 数据的分辨率从 `224 × 224` 提升到 `448 × 448`，数据做了精选处理，包括多模态数据 69M 和文本数据 7.8M。第二阶段的数据量比第一阶段少了 2 个量级。该阶段训练完成后，最终产出了 Qwen-VL base 模型。

**第三阶段：指令微调（Supervised Fine-tuning）**，主要提升模型的指令遵循能力和对话能力。在这个阶段作者对数据做了些数据增强，通过人工标注、模型生成和策略拼接等方式构造多模态的多轮会话数据。该阶段指令集数据共收集了 350K。

三个阶段详细的训练过程，包括：样本、模型和建模任务等细节，汇总到下图，如图 9 所示。

![图9、Qwen-VL 三阶段模型训练](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig9-training.jpg)
*图9、Qwen-VL 三阶段模型训练*

上面完整描述了 Qwen-VL 的核心工作，具体做法没有什么大的创新，数据规模和数据多样性上也没有明显的优势，所以 Qwen-VL 的模型效果基本就是中规中矩，没有太强的表现。下面我们再来看看 Qwen2-VL 的工作~

## 3. Qwen2-VL

相对于 Qwen-VL，Qwen2-VL 整体模型架构做的比较大的升级，首先从模型命名上可知，主体模型从 Qwen 升级到了 Qwen2。并且发布了三个 size 的模型，分别是 Qwen2-VL-2B，Qwen2-VL-7B，Qwen2-VL-72B（这里遵从 Qwen 官网发布的命名，后缀并不能准确表示模型的参数量，模型详细参数，详见下表）。

![图10、Qwen2-VL 模型参数](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig10-params.jpg)
*图10、Qwen2-VL 模型参数*

> 注：
> 1. Qwen2-VL 系列模型，针对 Vision Encoder 采用了相同 size 的模型结构，这里应该是做了一些 ablation 的实验，取得一个合适的 size。
> 2. 另外相对于 Qwen-VL 系列，Qwen2-VL 并没有显示描述 Vision-Language Adapter 的参数，通过查看源码，Qwen2-VL 对 Adapter 做了简化处理，并没有采用一个 Cross-Attention 的结构，而是使用了简单的线性变换层，这层参数比较少，相对于总参数规模，可以忽略不计。

除了主干模型的升级，论文中还提到了一些重要的升级点，总结如下：

- **采用原生动态分辨率：单一分辨率 -> 任意分辨率**，Qwen-VL 模型输入只接受单一分辨率的图片，Qwen2-VL 可输入不同分辨率的图像，避免了 Vision 数据适配单一分辨率而导致的失真问题。
- **Vision Encoder 位置编码：绝对位置编码 -> 相对位置编码**，从二维三角位置编码升级到二维 RoPE 位置编码，RoPE 对长序列有更好的泛化能力，有利于提升对长序列 Vision 特征的建模能力
- **LLM 主体模型位置编码**：**1D->3D RoPE**，引入多模态旋转位置编码技术（M-RoPE），刻画多模态（时序、高、宽）三维数据。进一步提升对时空数据的建模能力。
- **统一多模态数据：单图片 -> 统一图片和视频**，统一框架处理图片和视频数据，进一步提升对真实世界认知和理解能力
- **训练数据：1.4B -> 1.4T**，数据量提升了 3 个量级，同时数据覆盖了多领域任务。

下面详细介绍下这些升级点。

### 3.1 原生动态分辨率（Naive Dynamic Resolution）

#### 3.1.1 Patch' Pack 保留原生分辨率

回顾 2.1 章节的 Qwen-VL 使用的视觉编码器是标准的 ViT，这要求输入的图片要统一处理成单一的、固定的分辨率，才能 feed 到模型进行处理。一般标准的预训练好的 ViT，通常是将图片处理成正方形（长:宽=1:1）。这样处理后通常图片会失真，导致模型理解上有信息损失或引入一些误导。我们以 [Pix2Struct](https://arxiv.org/pdf/2210.03347) 论文中的例子，理解下固定分辨率处理的问题。如下图 10 所示：

![图11、Qwen-VL VS Qwen2-VL 的图像处理](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig11-dynamic-resolution.jpg)
*图11、Qwen-VL VS Qwen2-VL 的图像处理*

图 11 左侧是传统的 ViT 对输入的处理（也是 Qwen-VL 采用的方法），对于一些宽高比差距较大的图片，处理后通常会造成图片扭曲，而 Qwen2-VL 实现的**原生动态分辨率方法**则会保留原始图片的宽高比，将图片 resize 到适当的大小，图片像素满足 `[min_pixel, max_pixel]` 区间，再对图片做 Patch 处理，将每个图片处理成变长的 Vision token 序列，再输入给 LLM 模型。

目前看上述的方法是比标准的 ViT 更合理的，因为它保留了图片的原始分辨率，但是同时也引入了一个问题。

> 问题是这样：
> 传统的 ViT 会将任何图片数据都处理成定长的 Patch 序列，然后输入给 Vision Encoder，这种统一定长的输入是对硬件计算非常友好的，非常好组 Batch，并且不需要任何 padding 处理。Batch 序列中每个位置的计算都是有效的。
> 而对于上面提到的原生动态分辨率方法会将不同图片处理成不同长度的 Patch 序列。对于不同的长度的输入，做并行计算时，我们自然会想到类似于文本数据的操作，对数据做 padding，再 Feed 给模型。但这相比传统的 ViT 方法（无 Padding）会更慢（因为为了适配一个 Batch 中最长的序列，要做适当的 Padding 处理，导致会有些冗余计算）。因此这并不是一个完美的方法。Qwen2-VL 采用的原生动态分辨率方法实现上同时也考虑了性能问题。

那么原生动态分辨率方法具体是怎么实现的呢？**核心方法是采用了 NaViT 的 [Patch n' Pack](https://arxiv.org/pdf/2307.06304) 技术，把不同图像的多个 patch 打包到一个序列，能保留不同图片的可变分辨率。同时在一个次序列计算中同时可处理多个图像，提升了模型计算的吞吐，在性能上始终优于传统的 ViT**。其性能提升主要来源于 Pack 处理后，一个序列包括多个图片能同时计算，使得在固定计算预算下，动态分辨率方法能训练更多样本，从而带来更好的性能。

那么一个序列中塞进了多个图像数据，怎么能互不干扰的计算呢（也就是在做 ViT 的 Attention 计算时，多个图片的 Patch 在一个序列中需要做计算隔离）

我们以一个简单例子描述下动态分辨率方法的处理逻辑。

> **举例**：假设我们 5 张图片：`I_1 ~ I_5`，且 patch 长度为：`2 ~ 6`，即图片 Patch 后长度为：`{ I_1:2, I_2:3, I_3:4, I_4:5, I_5:6}`。为了描述简单，我们假设模型设置 Batch_Size=2，并且正好处理这 5 张图片到一个 Batch 中。

**处理过程：**

**a) 首先我们将 5 张图片进行 Pack，放到 2 个序列中**

一个很简单的方式是将 3 个 Patch 较短的图片放到一个序列 `S_1`，2 个较长 Patch 的图片放到一个序列 `S_2`。符号化为：`Batch = { S_1, S_2}`，其中 `S_1 = { I_1: 2, I_2:3, I_3:4}` 序列长度为 9，`S_2={I_4:5, I_5:6}` 序列长度为 11

**b) Batch 内做序列 Padding 对齐处理**

根据 Batch 内最长序列，通过 F.pad 方法做序列对齐，在序列前后增加 Padding token，该例子中由于 `S_1` 较短，需要在末尾增加 Padding token，处理后，如下图 12 所示

![图12、Patch' Pack 示例](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig12-patch-pack.jpg)
*图12、Patch' Pack 示例*

**c) 通过设置 Attention Mask 保证同 Sequence 中各图片计算隔离**

一个序列中有多张图片输入，在计算时要必须保证各图片的 Attention 计算是相互隔离的。实现上通过对 Attention Mask 矩阵做特殊的设置，来保证计算隔离。计算 Attention Mask 的过程如下：

首先，记录序列中每个图片起止 token 位置（包括初始 0 位置），得到两个位置序列为：`P_{s_1} = {0, 2, 5,9}` 和 `P_{s_2}={ 0, 5, 11}`，`P_{s_t}` 中连续的两个数 `(j, k)` 表示一张图片在序列中的长度为 `k-j` 个特征，且特征的起止位置为：`j` 和 `k-1`。

然后，分别用 `P_{s_1}` 和 `P_{s_2}` 来计算二维 Attention mask 矩阵，计算方式为：先初始化一个全 0 的 mask 矩阵，然后遍历每个 `P_{s_t}`，取 `[i, i+1]` 位置的两个数字 `(j, k)`，使得矩阵行列坐标都满足在 `[j, k-1]` 区间范围的位置置 1。两个序列计算后的 Mask 矩阵，如下图 13 所示。

![图13、Patch' Pack Attention Mask](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig13-attention-mask.jpg)
*图13、Patch' Pack Attention Mask*

计算好了上面的 Attention Mask 矩阵，在过 Vision Encoder 网络时，将 Attention Mask 作用在 Attention 计算上，就会隔离同一序列中不同图像的 Attention 计算。

#### 3.1.2 ViT 引入 2D-RoPE 位置编码

在 Qwen2-VL 系列的 ViT 网络中，并没有沿用 Qwen-VL 的 2D 绝对位置编码，而是引入了 2D-RoPE 相对位置编码。之所以引入 2D-RoPE，我个人理解主要考虑 Qwen2-VL 系列处理的图片 Patch 是变长的，对于超长的一些位置，如果采用绝对位置编码，由于数据稀疏性，并不能得到充分训练。但 RoPE 本身是具有一定的外推性，对长序列建模有更好的泛化能力。

我们都知道 1 维的旋转位置编码（1D-RoPE）对序列增加相对位置的处理过程。这里简单引用苏神的推导结论（详见：[博采众长的旋转式位置编码](https://kexue.fm/archives/8265)）。

首先对序列每个位置构建分块矩阵，形如：

![图14、RoPE 矩阵](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig14-rope-matrix.jpg)
*图14、RoPE 矩阵*

其中 m 表示序列的位置，`θ_i` 沿用 Sinusoidal 位置编码的取值，即：`θ_i = 10000^{-2i/d}`，d 为位置编码向量的维度。

在计算 Attention 时，计算 q,k 乘积前，要首先对 q,k 做变换，也就是给 m 位置的 q 乘矩阵 `R_m`，给 n 位置的 k 乘以矩阵 `R_n`。这样计算的 q,k 通过增加绝对位置的变换，实质上是增加了相对位置信息。如下公式：

![图15、RoPE 计算](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig15-rope-calc.jpg)
*图15、RoPE 计算*

由于上述 `R_m` 变换矩阵比较稀疏，直接用矩阵乘法来实现会浪费算力，苏神也给出了一个推荐的实现方式，如下：

![图16、RoPE 实现](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig16-rope-impl.jpg)
*图16、RoPE 实现*

其中 `⊕` 表示按位乘运算。

现在我们知道 1 维旋转位置编码 RoPE 的计算方式，那么怎么扩展到 2 维呢？参考苏神另一篇博客（详见：[二维位置的旋转式位置编码](https://kexue.fm/archives/8397)）。**RoPE 从 1 维扩展到 2 维一个简单的结论：针对一个位置 `(x, y)`，对维度为 d 的输入向量分成两半，前一半向量用 x 的一维 RoPE 矩阵(`R_x`)处理，后一半向量用 y 的一维 RoPE 矩阵(`R_y`)处理，然后再将两半处理后的结果拼接在一起，就做完了 2 维的 RoPE 处理。**（相对于一维 RoPE，扩展到二维，操作是比较简单，具体原理上请参考[苏神的博客](https://kexue.fm/archives/8397)）

### 3.2 输入投影层：压缩 Vision token + MLP Adapter

在上面 2.2 节我们讲过，Qwen-VL 在输入投影层做了 Vision token 的压缩处理，是采用了 Cross-Attention 的架构，通过一个组可学习的 Query 向量来压缩原始的特征序列。那么 Qwen2-VL 为什么没有继续沿用 Cross-Attention 的架构？

这里主要是因为 Cross-Attention 架构适合处理固定长度的 k,v，当 k,v 长短不一时，是不适合做 Attention 计算的。而 Qwen2-VL 通过原生动态分辨率方法处理的每个图片的 token 序列恰恰是变长的，无法使用 Cross-Attention 架构做特征压缩处理。

Qwen2-VL 采用了一种更简单的压缩方法：对空间位置临近的 patch 特征做拼接，再经过 2 层 MLP 线性变换，这样将原来长度为 n 的序列，可压缩到 n/4，最终将压缩后的特征序列输入给 LLM 模型。处理过程如图 17 所示：

![图17、Qwen2-VL 输入投影层 vision token 压缩流程](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig17-mlp-adapter.jpg)
*图17、Qwen2-VL 输入投影层 vision token 压缩流程*

为了区分 Vision token 和文本 token，Qwen2-VL 也引入了两个特殊的 token `<|vision_start|>` 和 `<|vision_end|>` 来标识 Vision token。

> 对于一个 `224 × 224`，如果 ViT 的 `patch_size=14`，最终将图片编码成一个 66 个 token 的序列输入到模型。
> 具体计算过程：
> 1. Patch 处理后的 Token 数为：`(224/14) × (224/14) = 16 × 16 = 256`
> 2. 经过输入投影层压缩处理：`256/4 = 64`
> 3. 最后再加上 2 个起止位置的特殊 token：`64+2 = 66`

### 3.3 Multimodal Rotary Position Embedding（M-RoPE）

Qwen2-VL 模型输入增加了视频模态，视频可以看做是在图片二维空间上，增加了时序维度，是三维时空分布的数据：`(T_{emporal}, H_{eight}, W_{idth})`，M-RoPE 将位置编码信息从 1 维扩展到了 3 维，这样就能清晰刻画视频模态数据时空位置信息。对于文本（一维）和图像（二维）的数据如何统一表示成 3 维的位置 ID 呢？处理也比较简单直接：

- **文本**：因为文本是一维空间序列，三个维度的值保持一致，也就退化成 1D-RoPE。
- **图像**：图像只有宽高两个维度，所以对于一张图片，时序维度 T 的位置始终保持固定。

对于混合多模态数据，每个模态的起始 position ID 是前面模态三维位置 ID 中取最大的 ID 并加 1 得到。

有了三维的位置，最终怎么映射成 3D-RoPE，映射方式类似与 2D-RoPE，**针对一个位置 `(x, y, z)`，对维度为 d 的输入向量分成三份，前一份向量用 x 的一维 RoPE 矩阵(`R_x`)处理，中间一份向量用 y 的一维 RoPE 矩阵(`R_y`)处理，最后一份向量用 z 的一维 RoPE 矩阵（`R_z`）处理，然后再将三份处理后的结果拼接在一起，就做完了 3 维的 RoPE 处理。**

M-RoPE 处理流程，如图 18 所示：

![图18、M-RoPE](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig18-mrope.jpg)
*图18、M-RoPE*

### 3.4 统一的图像和视频理解框架

Qwen2-VL 统一了视频和图像的理解框架，能混合输入图像和视频数据进行理解。为了保证图片和视频的处理一致，对视频和图像分别做如下处理：

**视频处理**：以每秒两帧的速率对视频进行采样，最终可采样偶数个帧序列。对于长视频为了平衡序列长度和计算效率，通过动态调整每一帧的分辨率，将视频总 token 限制在 16K 以内。

**图像处理**：对图像做复制操作，使得单一图片，变成一个时序为 2 的帧序列。

使用 3D 的卷积对帧序列做特征抽取，如图 19 所示，每两张图片为一组进行卷积操作抽取特征。这样通过将卷积核扩充了时序维度，可以进一步压缩序列长度，因此也能进一步提升模型处理更多帧的能力。

![图19、3D 卷积对帧序列做特征抽取操作](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig19-3d-conv.jpg)
*图19、3D 卷积对帧序列做特征抽取操作*

### 3.5 模型训练

Qwen2-VL 采用了与 Qwen-VL 一致的三阶段训练方式，详见图 9 所示。Qwen2-VL 在训练数据上相比 Qwen-VL 做了大量的有价值的工作。

数据来源除了获取开源数据、经过清洗的网页数据，还做的大量数据合成的工作。数据涉及多种场景，包括图像-文本对，OCR 数据，视觉问答数据，视频对话数据等多样化数据。

此外 Qwen2-VL 数据规模大幅提升，Qwen-VL 整体训练样本 1.4B 左右，Qwen2-VL 直接翻了 3 个量级达到了 1.4T。

通过大幅提升样本规模和样本多样性，使得 Qwen2-VL 的模型效果在多任务的评估中保持领先，也碾压了 GPT-4o 的效果。如图 20 所示。

![图20、Qwen2-VL 评估效果](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig20-evaluation.jpg)
*图20、Qwen2-VL 评估效果*

## 4. Qwen2.5-VL

Qwen2.5-VL 可循的材料只有一篇官方的[博客](https://qwenlm.github.io/zh/blog/qwen2.5-vl/)，官方的一张图基本描述了相对于 Qwen2-VL 的一些更新，详见图 21

![图21、Qwen2.5-VL](/assets/img/posts/2025-12-01-qwen-vl-series-technical-analysis/fig21-qwen25vl.jpg)
*图21、Qwen2.5-VL*

主要升级点包括：

**1. 提升时间和空间的感知能力**

**空间感知能力：** 我们在 Qwen-VL 的 2.3 节讨论过，在做一些 grounding 任务时，会将 box 的坐标点做 `(0,1000)` 的规范化处理，在 2.5 版本中，不进行坐标归一化，而是使用实际的像素点来表示坐标，这样能是模型学习到图像的真实尺寸信息。

**时间感知能力**：我们在 Qwen2-VL 的 3.3 节讨论过，引入了一个 M-RoPE 三维的位置编码，在做时序维度的位置编码处理时，跟空间维度的位置编码是一致的：对于一个模态的起始位置的 position ID，是相对于前面模态三维 ID 中最大的 ID 再加 1 得到。这对于时序维度的 ID 处理其实是不合理的，视频的时间是有绝对含义的，所以 2.5 对时间维度的位置 ID，采用了绝对位置编码。同时也引入了动态帧的技术，每秒随机动态采集帧序列，使得模型能够通过不同时间 ID 的间隔，来学习时间的节奏。

**2. 更简洁高效的视觉编码器**

- 从头训练了一个原生动态分辨率的 ViT。
- 引入了窗口注意力机制，有效减少了 ViT 端的计算负担。在 ViT 设置中，只有四层是全注意力层，其余层使用窗口注意力。最大窗口大小为 `8 × 8`，小于 `8 × 8` 的区域不需要填充，而是保持原始尺度，确保模型保持原生分辨率。
- 简化整体网络结构，ViT 架构与采用了 RMSNorm 和 SwiGLU 结构。

## 5. 总结

本文主要沿着 Qwen-VL 的一系列演进版本，系统梳理了 Qwen 多模态理解模型的技术点，发出来供大家参考~

最终总结下来，我觉得最核心部分还是数据的处理和合成的技术，能够基于多场景、多任务构造搜集大量样本，是一个很有难度的事情。

最后不得不说 Qwen2.5-VL 是真的强，试了一些多模态任务的例子，效果好到超出了我的预期，这也是驱使自己把 Qwen-VL 序列学习一遍的主要动因。

大家也不妨体验体验 Qwen2.5-VL：[Qwen Chat](https://chat.qwen.ai/)（模型选择 qwen2.5-vl-72b-instruct）

本人水平有限，如有错误，欢迎指正~

---

## 6. 参考文献

- Qwen-VL：[https://arxiv.org/pdf/2308.12966](https://arxiv.org/pdf/2308.12966)
- Qwen2-VL：[https://arxiv.org/pdf/2409.12191](https://arxiv.org/pdf/2409.12191)
- NaViT：[https://arxiv.org/pdf/2307.06304](https://arxiv.org/pdf/2307.06304)
- MM-LLMs 综述：[https://arxiv.org/pdf/2401.13601](https://arxiv.org/pdf/2401.13601)
- Qwen2.5-VL：[Qwen2.5 VL！Qwen2.5 VL！Qwen2.5 VL！](https://qwenlm.github.io/zh/blog/qwen2.5-vl/)
