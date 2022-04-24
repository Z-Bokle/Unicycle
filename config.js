let config = {
    mode:2, 
    /*
    运行模式
    0 重复发送msg的内容 msg类型为String
    1 随机发送msgList里的内容 msgList类型为String组成的Array
    2 从头开始依次发送msgFile中的文本内容，自动控制每次发送字符串长度为20 msgFile为本地的txt文件的路径
    由于采用一次性读入文件的方法处理文本文件，请不要打开较大的文本文件，以防内存溢出
    */
    roomid:1175675, //房间号
    delay:4000, //发送间隔，单位ms
    cnt:6, //下次启动后尝试发送次数，若为0则不停止，单次运行上限为800条
    msg:"晚安啦", 
    msgList:["晚安","你好","还能这样？","芜湖","什么鬼","好好好"],
    msgFile:"./text.txt"
}
export {config}