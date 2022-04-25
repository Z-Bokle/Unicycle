import fetch from 'node-fetch';
import readline from 'readline';
import moment from 'moment';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import request from 'superagent';
import { exit } from 'process';
import { config } from './config.js';
const rl = readline.createInterface({
    input:process.stdin,
    output:process.stdout
})
let cookieText = ''
let processedCookie = new Map()
let result = [{status:'success',times:0},{status:'fail',times:0}]
let help = {
    help:'help 查询可用指令',
    ls:'liveSignin 直播每日签到',
    ru:'runUnicycle 根据config.js的配置运行独轮车(停止运行请直接关闭应用)',
    pd:'postData 根据su指令的设置向目标直播间发送一条弹幕',
    awl:'查询某个评论区下的阿瓦隆信息',
    exit:'exit 退出应用'
}
console.log("开始运行Unicycle");

//用Promise将同步的readline的询问功能转换为异步函数
const getLine = (question) => {
    return new Promise((resolve, reject) => {
        rl.question(question, (answer) => {
            resolve(answer)
        })
    })
}

//登录并存储cookie
const login = async (oauthKey) => {
    console.log('Using oauthKey:',oauthKey)
    let loginRes = await fetch('https://passport.bilibili.com/qrcode/getLoginInfo',{
        credentials:'include',
        method:'POST',
        body:`oauthKey=${oauthKey}`, //注意POST方式以form形式传输信息的body写法和直接传输json不同
        headers:{'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}
    })
    
    let cookie = loginRes.headers.get('set-cookie')
    fs.writeFileSync('./loginCookie.txt', cookie) //同步方法写入cookie

    let {code, message, ts, data} = await loginRes.json()
    if(code !== 0){
        console.error(message)
    }
    else{
        console.log(moment.unix(ts).format('YYYY-MM-DD hh:mm:ss'),'成功登录')
    }
}

//扫码登录
const qrLogin =  async () => {
    let res = await fetch('https://passport.bilibili.com/qrcode/getLoginUrl')
    let {code, ts, data} = await res.json()
    if(code === 0){
        console.log(moment.unix(ts).format('YYYY-MM-DD hh:mm:ss'),'成功获取登录URL')
        let {url, oauthKey} = data
        qrcode.generate(url,{small: true})
        let userAnswer = await getLine('请使用Bilibili客户端扫码，确认后请输入yes\n') 
        if(userAnswer === 'yes' || userAnswer === 'Yes'){
            await login(oauthKey)
        }
        else{
            console.log("登录失败，请检查网络并重新启动应用")
            exit(0)
        }
    }
    else{
        console.error('获取登录二维码失败，请检查网络并重新启动应用')
        exit(0)
    }
}

//解析Cookie文本，转换为可以用于Headers中的文本
const getCookie = async () => {
    let cookie = fs.readFileSync('./loginCookie.txt', 'utf-8') //同步方法读取cookie



    cookie.split(', ').forEach((e1) => {
        e1.split('; ').forEach((e2) => {
            let arr = e2.split('=')
            if(arr.length === 2){
                processedCookie.set(arr[0],arr[1])
            }
        })
    })
    processedCookie.delete('Expires')
    processedCookie.delete('Path')
    processedCookie.delete('Domain')

    processedCookie.forEach((value,key) => {
        cookieText += `${key}=${value}; `
    })
}

// 直播签到
const liveSignin = async () => {
    console.log('-----------------开始执行直播签到操作-----------------')
    console.time('直播签到用时:')

    //fetch API无法自定义发送的Cookie，这里使用superagent代替fetch处理需要发送cookie的请求
    request.get('https://api.live.bilibili.com/xlive/web-ucenter/v1/sign/DoSign')
    .set('Cookie',cookieText)
    .end((err,res) => {
        console.log("本次http请求状态码",res.status)
        
        let code = res.body.code
        let message = res.body.message
        console.log(code, message)
        console.timeEnd('直播签到用时:')
        console.log('-----------------结束执行直播签到操作-----------------')
    })
    
}

//发送一条弹幕
const postData = async (roomid, msg, csrf) => {
    request.post('https://api.live.bilibili.com/msg/send')
    .set('Cookie',cookieText)
    .send(`bubble=${0}&msg=${msg}&color=${16777215}&fontsize=${25}&mode=${1}&roomid=${roomid}&rnd=${(new Date()).getTime() / 1000}&csrf=${csrf}&csrf_token=${csrf}`)
    .end((err,res) => {
        console.log("本次http请求状态码",res.status)
        let code = res.body.code
        let message = res.body.message
        console.log(code,message)
        if(code === 0) result[0].times++
        else result[1].times++
    })
}

//启动独轮车
const unicycle = async () => {
    result = [{status:'success',times:0},{status:'fail',times:0}]

    let cnt = config.cnt <= 0 ? 800 : Math.min(config.cnt, 800)

    console.log('-----------------开始执行独轮车操作-----------------')

    async function run(mode){
        setTimeout(() => {
            console.log('-----------------结束执行独轮车操作-----------------')
            console.log('本次独轮车运行情况')
            console.table(result)
        },(cnt + 1) * config.delay)   

        if (mode === 0) {//复读模式
            for(let i = 0; i < cnt; i++)
                setTimeout(() => {
                    console.time(`发送弹幕${i}用时`)
                    postData(config.roomid,config.msg,processedCookie.get('bili_jct'))
                    console.log("尝试发送弹幕",config.msg)
                    console.timeEnd(`发送弹幕${i}用时`)
                }, config.delay * i)         
        }
        else if (mode === 1) {//随机复读模式
            for(let i = 0; i < cnt; i++){
                let str = config.msgList[Math.floor(Math.random() * config.msgList.length)]
                setTimeout(() => {
                    console.time(`发送弹幕${i}用时`)
                    postData(config.roomid,str,processedCookie.get('bili_jct'))
                    console.log("尝试发送弹幕",str)
                    console.timeEnd(`发送弹幕${i}用时`)
                }, config.delay * i)                
            }
        } 
        else if (mode === 2) {//顺序播报模式
            if(fs.existsSync(config.msgFile)){
                let text = fs.readFileSync(config.msgFile,'utf-8')
                for(let i = 0; i < cnt; i++){
                    let str = text.substring(i * 20, i * 20 + 19)
                    setTimeout(() => {
                        console.time(`发送弹幕${i}用时`)
                        postData(config.roomid,str,processedCookie.get('bili_jct'))
                        console.log("尝试发送弹幕",str)
                        console.timeEnd(`发送弹幕${i}用时`)
                    }, config.delay * i)                
                }               
            }
            else{
                console.error("未找到指定文件:",config.msgFile)
            }
        }
        else {
            console.error("错误的mode数值:",config.mode)
        }
    }
    await run(config.mode)

}

//搜索特定评论区内被阿瓦隆锁定的评论
const awlSearch = async () => {
    let commentType = new Set([{code:1,type:'视频稿件',oid:'avid'},{code:12,type:'专栏',oid:'专栏cvid'},{code:17,type:'动态(纯文字或分享)',oid:'动态id'}])
    console.log(commentType)
    let code = await getLine("请输入需要查询的评论区类型对应code，目前支持上述类型\n")
    let oid = await getLine("请输入需要查询的评论区类型对应oid，目前支持上述类型\n")


    let awlComment = []
    let is_end = false
    let i, cnt, next

    console.log('-----------------开始扫描阿瓦隆操作-----------------')
    console.time("获取评论区总信息用时：")
    request.get(`http://api.bilibili.com/x/v2/reply/main?type=${code}&oid=${oid}&mode=2`)
    .set('Cookie',cookieText)
    .end((err,res) => {
        
        console.log("本次http请求状态码",res.status)
        // console.log(res.body)
        cnt = res.body.data.cursor.all_count
        console.log("预计总共扫描",cnt,"条评论")
        is_end = res.body.data.cursor.is_end
        next = res.body.data.cursor.next
        console.timeEnd("获取评论区总信息用时：")

        for(i = cnt;i > 1 && !is_end; i-=20)
            setTimeout(() => {
                request.get(`http://api.bilibili.com/x/v2/reply/main?type=${code}&oid=${oid}&mode=2&next=${next}`)
                .set('Cookie',cookieText)
                .end((err,res) => {
                    console.log("本次http请求状态码",res.status)
                    if(res.body.code === 0){
                        let replies = res.body.data.replies
                        replies.forEach((replie) => {
                            if(replie.state == 17){
                                awlComment.push(replie)
                                console.log('检测到awl评论',replie)
                            }
                        })
                        is_end = res.body.data.cursor.is_end
                        next = res.body.data.cursor.next
                    }
                    else{
                        console.log(res.body.message)
                    }
                })
            }, 1000 * (cnt-i) / 20)
            //由于B站反爬虫限制，直接采用异步逻辑会导致IP被暂时封锁，可采用代理/分布式部署解决问题，但小成本项目，这里采用设置特定间隔的方式模拟同步逻辑
            //分布式爬虫一旦设置不好就变成类似DDoS的情形了...
        setTimeout(() => {
            console.log('-----------------结束扫描阿瓦隆操作-----------------')
            console.log("共统计到您的阿瓦隆评论数量：",awlComment.length)
            if(awlComment > 0) console.log("集体评论为",awlComment)
        }, 1000 * (cnt + 1) / 20)

    })


}


(async () => {
    //主函数
    let exist = fs.existsSync('./loginCookie.txt')
    if(!exist) fs.writeFileSync('./loginCookie.txt','') //文件不存在则新建文件
    let cookie = fs.readFileSync('./loginCookie.txt', 'utf-8') //同步方法读取cookie
    if((!exist) || (cookie.length === 0)){
        console.log("未检测到登录信息，请扫码登录")
        await qrLogin()
    }
    await getCookie()

    while(true){
        let userAnswer = await getLine("请输入指令执行操作，输入help查询可用指令\n")
        switch (userAnswer) {
            case 'help':
                console.log(help)
                break;
            case 'exit':
                console.log("程序已结束")
                rl.close()
                exit(0)
            case 'ls':
                await liveSignin()
                break;
            case 'ru':
                await unicycle()
                break;
            case 'pd':
                await postData(config.roomid,config.msg,processedCookie.get('bili_jct'))
                break;
            case 'awl':
                await awlSearch();
            default:
                console.log('未知指令')
                break;
        }
    }
    
})()
