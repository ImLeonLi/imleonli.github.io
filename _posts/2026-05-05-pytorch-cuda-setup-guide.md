---
layout: post
title: "Windows 下使用 uv + PyTorch CUDA 12.8 搭建「动手学深度学习」环境踩坑全记录"
date: 2026-05-05 12:22:48 +0800
tags: [PyTorch, CUDA, uv, 深度学习, d2l]
category: 技术分享
---

# Windows 下使用 uv + PyTorch CUDA 12.8 搭建「动手学深度学习」环境踩坑全记录

> 记录在 Windows 环境下使用 uv 虚拟环境管理器安装 PyTorch（CUDA 版本）和 d2l 教程配套包过程中遇到的坑和解决方案。

## 📋 环境信息

### 硬件

| 项目 | 信息 |
|------|------|
| GPU | NVIDIA GeForce RTX 3070 Ti |
| 显存 | 8 GB GDDR6X |
| 驱动版本 | 566.36 |
| 驱动支持 CUDA 版本 | 12.7 |

### 软件

| 项目 | 信息 |
|------|------|
| 操作系统 | Windows 10/11 |
| Python | 3.10.18 |
| 虚拟环境管理器 | uv（Astral 出品的极速包管理器） |
| PyTorch | 2.11.0+cu128 |
| CUDA 版本 | 12.8（PyTorch 自带 Runtime） |
| d2l | 1.0.3 |
| 教程代码目录 | `D:\Project\d2l\` |

> **注意**：`nvidia-smi` 显示的 CUDA Version（12.7）是驱动支持的最高版本，不代表实际安装的 CUDA 版本。PyTorch 自带 CUDA Runtime（12.8），向下兼容驱动支持的版本。

---

## 🔍 背景与选型

### 为什么是 PyTorch？

「动手学深度学习」（[zh.d2l.ai](https://zh.d2l.ai)）提供了 PyTorch、TensorFlow、MXNet、Paddle 四个框架版本。PyTorch 是当前深度学习领域的主流框架，生态完善，社区活跃，选择 PyTorch 版本最为合适。

### 为什么选 CUDA 12.8？

| CUDA 版本 | PyTorch 支持 | 状态 |
|-----------|-------------|------|
| 11.7 | 最高到 2.0.1 | ❌ 已淘汰 |
| 11.8 | 支持 | 可用但偏旧 |
| 12.6 | 支持（当前最低） | 稳定 |
| **12.8** | **支持（当前最高）** | ✅ **推荐，12.x 收尾版本** |
| 13.x | PyTorch 稳定版尚未跟进 | 不推荐 |

CUDA 12.8 是当前 PyTorch 稳定版支持的最高 CUDA 版本，稳定性和兼容性最好。

### 为什么用 uv？

uv 是 Astral（ruff 的开发团队）出品的 Python 包管理器，比 pip 快 10-100 倍，支持全局缓存、虚拟环境管理等功能。

### PyTorch 安装是否需要单独安装 CUDA Toolkit？

**不需要。** PyTorch 的 wheel 包自带 CUDA Runtime（cudart、cublas、cudnn 等），足以支持所有深度学习操作。只有需要编写 CUDA C/C++ 代码（`.cu` 文件，使用 `nvcc` 编译）或使用 Nsight 性能分析工具时才需要安装完整的 CUDA Toolkit。

---

## 🚀 正确安装步骤

### 第一步：下载并解压教程代码

```bash
# 创建项目目录
mkdir D:\Project\d2l
cd D:\Project\d2l

# 下载教程代码（官方提供的 d2l-zh 2.0.0）
curl https://zh-v2.d2l.ai/d2l-zh-2.0.0.zip -o d2l-zh.zip
```

解压方式（Windows 下需注意）：

```bash
# Git Bash（推荐）
unzip d2l-zh.zip && rm d2l-zh.zip

# PowerShell
Expand-Archive -Path d2l-zh.zip -DestinationPath . ; Remove-Item d2l-zh.zip

# CMD（需要额外安装 unzip 或用 PowerShell 命令代替）
powershell -Command "Expand-Archive d2l-zh.zip . ; Remove-Item d2l-zh.zip"
```

> ⚠️ **Windows 注意**：教程原始命令 `unzip d2l-zh.zip && rm d2l-zh.zip` 是 Linux 语法，Windows CMD 中不可用。建议使用 Git Bash 或 PowerShell 执行解压。

解压后目录结构：

```
D:\Project\d2l\
├── pytorch/          ← 推荐，主流框架
├── tensorflow/
├── mxnet/
└── paddle/
```

也可以直接从教程页面 [zh.d2l.ai](https://zh.d2l.ai) 顶部点击「Jupyter 记事本」下载 zip 文件。

### 第二步：创建 uv 虚拟环境

```bash
cd D:\Project\d2l
uv venv --python 3.10
```

> ⚠️ **必须使用 Python 3.10**。不要用 3.12+，原因见下方踩坑记录。

### 第三步：激活虚拟环境

```bash
# Git Bash
source .venv/Scripts/activate

# CMD
.venv\Scripts\activate.bat

# PowerShell
.\.venv\Scripts\Activate.ps1
```

### 第四步：安装 PyTorch（CUDA 12.8）

```bash
uv pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu128
```

> ⚠️ **关键**：必须使用 `--extra-index-url`，不能用 `--index-url`。原因见下方踩坑记录。

### 第五步：验证 CUDA 可用

```bash
python -c "import torch; print(f'Version: {torch.__version__}, CUDA: {torch.cuda.is_available()}')"
```

预期输出：
```
Version: 2.11.0+cu128, CUDA: True
```

### 第六步：安装 d2l 和 Jupyter

```bash
uv pip install d2l jupyter
```

### 第七步：启动学习

```bash
cd D:\Project\d2l\pytorch
jupyter notebook
```

打开浏览器访问 `http://localhost:8888`，从 `chapter_introduction` 开始学习。

---

## 💥 踩坑记录

### 坑一：`uv pip install torch ... --index-url` 安装了 CPU 版

**现象**：

```bash
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

安装完成后 `torch.__version__` 显示 `2.11.0+cpu`，`torch.cuda.is_available()` 返回 `False`。

**原因**：

`--index-url` 会**替换**默认 PyPI 源，uv 在解析时可能在版本选择上走了 CPU wheel。而 `--extra-index-url` 是在 PyPI 之外**追加** PyTorch 官方源，两个源同时查询，**优先匹配带 CUDA 后缀的 wheel**。

**解决**：

```bash
# ❌ 错误：会安装 CPU 版
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128

# ✅ 正确：安装 CUDA 版
uv pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu128
```

**参数对比**：

| 参数 | 行为 | 结果 |
|------|------|------|
| `--index-url` | 替换默认 PyPI 源 | uv 解析优先级异常，装了 CPU 版 ❌ |
| `--extra-index-url` | 追加 PyTorch 源，PyPI 仍可用 | 正确匹配 CUDA wheel ✅ |

---

### 坑二：Python 3.12+ 下 d2l 依赖构建失败

**现象**：

```
ModuleNotFoundError: No module named 'distutils'
```

或

```
ModuleNotFoundError: No module named 'pkg_resources'
```

**原因**：

`d2l 1.0.3` 锁定了旧版依赖：

```
numpy==1.23.5
pandas==2.0.3
matplotlib==3.7.2
scipy==1.10.1
```

这些旧版没有 Python 3.12+ 的预编译 wheel（`.whl`），需要从源码构建。但：

- `numpy 1.23.5` 的构建依赖 `distutils`，在 Python 3.12 中已被移除
- `pandas 2.0.3` 的构建依赖 `pkg_resources`，在 `setuptools >= 70` 中已被移除

**解决**：

使用 **Python 3.10** 创建虚拟环境，这些版本在 Python 3.10 下有预编译 wheel，无需源码构建。

```bash
# ❌ 错误
uv venv --python 3.12

# ✅ 正确
uv venv --python 3.10
```

**版本兼容表**：

| Python 版本 | numpy 1.23.5 | pandas 2.0.3 | 结果 |
|-------------|:---:|:---:|------|
| 3.10 | ✅ wheel | ✅ wheel | 一次成功 |
| 3.11 | ✅ wheel | ✅ wheel | 也可以 |
| 3.12+ | ❌ 需源码 | ❌ 需源码 | 构建失败 |

---

### 坑三：安装顺序导致 CUDA 版被覆盖

**现象**：

先装 `d2l`，再装 `torch`，发现装的是 CPU 版。

**原因**：

如果 `d2l` 先安装了 CPU 版 torch，后续安装 CUDA 版 torch 时可能出现版本冲突或覆盖不完整。

**解决**：

**先装 PyTorch CUDA 版，再装 d2l**。如果 d2l 已经先装了，先卸载再重装：

```bash
uv pip uninstall torch torchvision torchaudio -y
uv cache clean
uv pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu128
python -c "import torch; print(torch.cuda.is_available())"  # 确认 True 后再继续
uv pip install d2l jupyter
```

---

### 坑四：`nvidia-smi` 在 WorkBuddy 终端中报错

**现象**：

```
Failed to initialize NVML: Unknown Error
```

**原因**：

WorkBuddy 的终端环境可能没有管理员权限，无法访问 NVIDIA 驱动管理接口（NVML）。

**解决**：

使用**管理员权限的 CMD** 运行 `nvidia-smi`，或通过 PowerShell 查询：

```powershell
Get-WmiObject Win32_VideoController | Where-Object { $_.Name -like '*NVIDIA*' } | Select-Object Name, DriverVersion, DriverDate
```

---

## 📌 总结

| 踩坑点 | 核心教训 |
|--------|---------|
| uv 安装 PyTorch | 用 `--extra-index-url` 代替 `--index-url` |
| Python 版本选择 | 用 3.10，避免 3.12+ 的兼容问题 |
| 安装顺序 | 先装 PyTorch，后装 d2l |
| nvidia-smi 不可用 | 换管理员权限终端或用 WMI 查询 |
| CUDA 版本选择 | 12.8 是当前最佳平衡点 |

## 🔗 参考链接

- [PyTorch 官方安装页面](https://pytorch.org/get-started/locally/)
- [PyTorch 历史版本](https://pytorch.org/get-started/previous-versions/)
- [动手学深度学习](https://zh.d2l.ai)
- [uv 官方文档](https://docs.astral.sh/uv/)
- [CUDA 下载](https://developer.nvidia.com/cuda-downloads)
