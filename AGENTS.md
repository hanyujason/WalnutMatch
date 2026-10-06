# WalnutMatch 工作约定

- 固定工作目录：/Users/hyj/Developer/WalnutMatch。持续修改同一个项目，不另建版本副本目录。
- 每轮完成的源码修改运行适当检查后 commit，并 push 到 origin；不要提交未完成或测试失败的改动。
- 程序打包统一输出到 release/，本机该目录只保留最新版；release/ 不进入 Git。
- 有功能变化的可运行版本更新版本号并保存到 GitHub Releases；上传并确认安装包完整后才能清理本地旧版本。
- 源码历史由 Git commit 和版本 tag 保存；安装包历史由 GitHub Releases 保存，二者不能互相替代。
- 不上传 .local-data、qa、API 密钥、settings.json、key.enc、个人 reports 或未获许可的商家照片。
- 不修改用户数据目录；替换打包目录前确认不影响正在运行的程序。
- 用户讨论需求、检查计划时不直接实现尚未确认的功能。三棱、拍照提示、细节补充和尺寸选填仍待实现。
