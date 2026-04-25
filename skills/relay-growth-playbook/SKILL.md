---
name: relay-growth-playbook
description: "Use when packaging an AI relay station into sellable products or operator materials: 商品结构, 套餐设计, 代理资料, 接入文档, FAQ, 闲鱼/社群文案, reseller onboarding, screenshots, delivery notes, or content kits for gateway customers and partner agents."
---
# Relay Growth Playbook

## 何时使用

当用户需要以下能力时触发本 skill：

- 设计高质量版、混合版、全能版商品结构
- 生成终端用户接入文档、FAQ 和充值说明
- 生成代理商资料包、分发说明、交付模板
- 生成闲鱼、社群、海报、教程等内容骨架
- 把当前中转站能力整理成“能卖、怎么卖、卖给谁”的材料

## 工作流程

1. 先读取当前路由、模型目录、价格策略和风控边界。
2. 按对象拆分材料：终端用户、代理商、合作智能体三类。
3. 统一文案口径：只写域名，不写源站 IP；只写可售能力，不夸大未验证线路。
4. 输出对外材料时，始终带上预算限制、充值方式和高价模型风险说明。
5. 如需对接发卡或自动交付，优先复用已有文档模板和商品结构，不重复造轮子。

## 输出要求

- 不暴露服务器 IP、上游密钥、后台管理员入口
- 区分“高质量版 / 混合版 / 全能版”三类商品
- 对代理商说明倍率、权限边界和充值方式
- 对终端用户说明接入地址、Key、模型范围、预算限制
- 对外口径只写已验证可用能力

## 参考文件

- 设计商品层级时读取 `references/product-packaging.md`
- 生成代理资料和交付 SOP 时读取 `references/reseller-sop.md`

## 自动触发关键词

- 商品结构
- 套餐设计
- 代理资料
- 接入文档
- FAQ
- 闲鱼文案
- 发卡说明
- 教程内容