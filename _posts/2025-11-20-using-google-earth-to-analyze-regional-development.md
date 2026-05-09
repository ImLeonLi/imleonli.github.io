---
layout: post
title: "饿不着的瞎家qiao - 用 Google Earth 看地区的发展情况"
date: 2025-11-20 00:00:00 +0800
tags: [Google Earth, GEE, 遥感, 光谱分析, Dynamic World]
category: 技术分享
---

# 饿不着的瞎家qiao - 用 Google Earth 看地区的发展情况

最初的需求是通过图像分析一个地区的发展情况。通过对比不同时间的卫星影像，观察建筑物的变化来判断区域发展。误打误撞，最终找到了 Dynamic World V1 数据集，完美解决了问题。

## Google Earth 简介

Google Earth（谷歌地球）是一款由 Google 提供的虚拟地球仪软件，它整合了卫星影像、航拍照片、GIS 数据与三维地形，可快速浏览全球任意角落的高分辨率影像，为光谱特征分析提供直观、便捷的底图与样本选取环境。借助其历史影像功能，还能追踪同一区域在不同时间的光谱变化，辅助验证分类结果。

## 实践过程

### 最初的尝试：CV 图像分析

在最初实现这个需求的时候，还只是从图像角度考虑，没有考虑到光谱特征的分析，因为之前对 Google Earth Engine 没有多少了解，只是简单地用它来查看图像。

通过手动截取 2021 和 2025 年两张相同位置的图片，使用 CV（计算机视觉）方式分析图像，尝试识别建筑物。但效果并不明显，只有边缘检测还可以，通过检测到的边缘多少，大概能知道有建筑的增长。但问题是容易受到云的影响，会干扰识别效果。

### 转向光谱分析

为了解决云的问题，开始研究卫星影像的光谱特征。无意中知道卫星拍摄的遥感图像有很多通道（波段），每个通道中有不同的信息，不同波段可能有不同的作用。

在这个过程中接触了很多数据来源，包括 NASA、欧盟的 Sentinel-2 等卫星数据。

### 发现 Dynamic World V1

在探索过程中，发现了 **Dynamic World V1** 数据集。这是一个非常实用的土地利用/土地覆盖（LULC）数据集，正好能满足分析地区发展情况的需求——它直接给出了 9 种不同的土地覆盖类别，包括建成区（建筑物）、植被、水体等，无需自己训练模型进行图像分类。

## Dynamic World V1 介绍

[Dynamic World V1](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1) 是由 Google 与美国国家地理学会、世界资源研究所合作开发的**近乎实时（NRT）土地利用/土地覆盖数据集**。

### 主要特点

| 特性 | 说明 |
|------|------|
| **空间分辨率** | 10 米 |
| **时间覆盖** | 2015 年 6 月 27 日至今 |
| **数据源** | 基于 Sentinel-2 L1C 卫星影像 |
| **更新频率** | 2-5 天（取决于纬度） |
| **云处理** | 自动遮盖云和云阴影（云量 <= 35%） |

### 9 种土地覆盖类别

Dynamic World V1 将地表分为以下 9 个类别，每个像素都会给出属于该类别的概率（0-1）：

| 值 | 类别（英文） | 类别（中文） | 说明 |
|:--:|:------------|:------------|:------------|
| 0 | water | **水体** | 河流、湖泊、海洋等水域 |
| 1 | trees | **树木** | 森林、茂密植被 |
| 2 | grass | **草地** | 草原、牧场、稀疏植被 |
| 3 | flooded_vegetation | **淹没植被** | 湿地、沼泽、红树林 |
| 4 | crops | **农作物** | 农田、耕地 |
| 5 | shrub_and_scrub | **灌木和矮灌木** | 猫木丛、稀疏林地 |
| 6 | built | **建成区** | **建筑物、城市区域** |
| 7 | bare | **裸地** | 裸土、沙地、建筑工地 |
| 8 | snow_and_ice | **积雪和冰** | 冰川、雪地 |

### 数据波段说明

Dynamic World V1 包含 10 个波段：

- **9 个概率波段**：water、trees、grass、flooded_vegetation、crops、shrub_and_scrub、built、bare、snow_and_ice，每个像素的概率值范围 0-1，同一像素 9 个概率之和为 1
- **1 个标签波段（label）**：取概率最高的类别索引（0-8），方便直接分类显示

### 为什么适合分析地区发展

对于分析地区发展情况的需求，**built（建成区，值 6）** 类别是最关键的指标：

1. **直接对应建筑物**：无需自己训练模型识别建筑
2. **时间序列分析**：可以获取同一地区多年的数据，观察建成区的扩张情况
3. **量化统计**：可以计算某区域内建成区的面积占比变化
4. **10 米分辨率**：足够识别城市区域的变化

### 使用建议

由于 Dynamic World 是基于单张影像的预测，对于某些类别（如农作物）或高反射率表面，排名最高的概率可能相对较低。建议：

- 对概率值进行阈值过滤，只选择有把握的像素（如概率 > 0.6）
- 结合时间序列数据进行验证
- 在 Earth Engine Code Editor 中先可视化观察，确认数据符合预期

## 数据获取与应用

使用 Dynamic World V1 分析地区发展的基本流程：

1. **在 Earth Engine Code Editor 中定义研究区域**
2. **筛选时间范围内的影像**（如 2020 年和 2024 年）
3. **提取 built（建成区）波段**
4. **计算区域内建成区面积或占比**
5. **对比不同时间点的变化**

## 数据来源

- Google Earth: <https://earth.google.com/>
- Dynamic World V1: <https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1>
- Dynamic World 教程: <https://developers.google.com/earth-engine/tutorials/community/introduction-to-dynamic-world-pt-1>

## 引擎/工具

- Google Earth Engine: <https://developers.google.com/earth-engine?hl=zh-cn>
- Google Earth Engine Code Editor: <https://code.earthengine.google.com/>

## 参考资料

- Brown, C.F., Brumby, S.P., Guzder-Williams, B. et al. Dynamic World, Near real-time global 10 m land use land cover mapping. Sci Data 9, 251 (2022). <https://doi.org/10.1038/s41597-022-01307-4>
- 如何从卫星多通道图像中辨别道路或建筑物的多少【豆包会话】：<https://www.doubao.com/chat/30091468000898306>
