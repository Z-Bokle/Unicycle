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

//登录
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


    console.log('-----------------开始执行独轮车操作-----------------')

    async function run(){
    for(let i = 0; i < config.cnt; i++)
        setTimeout(() => {
            console.time(`发送弹幕${i}用时`)
            postData(config.roomid,config.msg,processedCookie.get('bili_jct'))
            console.timeEnd(`发送弹幕${i}用时`)
        }, config.delay * i)

        setTimeout(() => {
            console.log('-----------------结束执行独轮车操作-----------------')
            console.log('本次独轮车运行情况')
            console.table(result)
        },(config.cnt + 1) * config.delay)
    }
    await run()

}

(async () => {
    //主函数
    let cookie = fs.readFileSync('./loginCookie.txt', 'utf-8') //同步方法读取cookie
    if(!cookie){
        console.log("未检测到登录信息，请扫码登录")
        await qrLogin()
    }
    await getCookie()

    // console.log(processedCookie)

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
            default:
                console.log('未知指令')
                break;
        }
    }
    
})()
