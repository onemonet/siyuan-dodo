# Google Maps 第三地图源

本插件支持 OpenStreetMap、高德地图、Google Maps；默认仍使用 OSM，旧地图配置和思源数据库不会被迁移或改写。

## 配置步骤

1. 在 Google Cloud 新建项目并启用结算账号，启用 **Maps JavaScript API**；如需地点搜索启用 **Places API (New)**，地址名称反查使用 Maps JavaScript API Geocoding 服务。
2. 在 Google Maps Platform 的 **Map Management / Map IDs** 为 JavaScript 地图创建 Map ID。`DEMO_MAP_ID` 仅用于开发测试，不建议正式使用。
3. 为浏览器创建 API Key，限制允许调用的 API 并配置允许的 HTTP Referrer：思源本地访问源 `http://127.0.0.1:6806/*`、`http://localhost:6806/*`，以及实际使用的本地/远程思源地址（按真实地址填写）。由于桌面访问源可能变化，应在 Cloud Console 的凭据详情核对当前请求来源。
4. 在思源 **Dodo 插件 → 自定义块 → 地图块** 选择 **Google Maps**，填写 **Google Maps Key**、**Google Map ID**。地图块仍沿用原位置列 `keyID`、图片列 `keyID` 和 WGS84 坐标。
5. 默认开启「开启搜索」。Google 模式使用 Places (New) 自动补全和 Place Details，相关查询可能单独计费；如不需要请关闭。为防止意外收费，建议先设置 Cloud 预算提醒以及每项 API 的配额上限。

Google Maps JavaScript API 的 Key 会在本机浏览器向 Google 加载脚本时传输，**它不是服务端密钥**。请通过 HTTP Referrer + API 限制保护，不要把服务端密钥填入此处，也不要把真实 Key 提交到 Git。

## 坐标、标记和失败回退

- 三个地图引擎共享相同的思源数据库、WGS84 位置坐标和字段 ID 映射。只有高德瓦片/高德 API2 需要按中国坐标 GCJ-02 绘制；Google Maps 和 OSM 均直接使用 WGS84。
- Google 地图图文标记采用 Maps JavaScript API `AdvancedMarkerElement`，保留原有聚合、悬停、右键矫正/删除、点击打开条目和视口记录逻辑。`AdvancedMarkerElement` 必须使用 Map ID。
- Google 模式点击新增位置时，可以反查 Google 地址用于临时参考；跨地图共享的数据库只会保存**用户手动填写的地点名称**或**WGS84 经纬度**，不会直接持久化 Google 自动产生的地址内容，避免之后切换到高德/OSM 时重用 Google 地图内容。无查询结果或出错时继续按坐标新增。
- Google 无 Key、无 Map ID、网络加载失败或认证失败时使用 OSM 作为备用底图，同时提示检查 Key、结算、API 权限、Map ID 与网络/HTTP 来源设置。其它两种地图服务不依赖 Google。
- 尚未使用真实付费 Google Key 进行线上功能测试（配置由用户提供）。

官方资料：
- https://developers.google.com/maps/documentation/javascript/load-maps-js-api
- https://developers.google.com/maps/documentation/javascript/advanced-markers/start
- https://developers.google.com/maps/documentation/javascript/place-autocomplete-data
- https://developers.google.com/maps/documentation/javascript/geocoding
- https://developers.google.com/maps/billing-and-pricing/pricing
