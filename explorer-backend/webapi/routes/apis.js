const router = require('koa-router')()
var bs58check = require('bs58check')
//czr start 
let Czr = require("czr");
let czr = new Czr();

// db start
var PgPromise = require('../../database/PG-promise');// 引用上述文件
var pgPromise = PgPromise.pool;

//定時獲取apikeys
let allApikeys = ["YourApiKeyToken"]; //緩存所有的apikeys
let lastTimestamp = 0;
let intval2getApikeys = 500 * 1000;//獲取apikeys的間隔時間

async function updtAPikeys() {
  let sql = `select apikey from api_keys where create_timestamp > ${lastTimestamp}`
  rlt = await pgPromise.query(sql);
  rlt.rows.forEach(item => {
    allApikeys.push(item.apikey);
    if (item.create_timestamp > lastTimestamp) {
      lastTimestamp = item.create_timestamp;
    }
  })
}

//判断字符串是不是一个address 
function  invalidAcct(acct){
  let pat = /czr_[0-9a-z]{50,}/i;
  return pat.test(acct)?  false:true 
}


//判断字符串是不是一个交易hash
function invalidTxHash(hash){
  let pat = /[0-9a-f]{64,}/i
  return  pat.test(hash)? false:true
}

// db end
router.prefix('/apis')

// ******************************** 账户模块 开始


/**
 * 
 * 接口：验证时不时合法的czr地址
 * 参数：
 *  {
        module  : account
        action  : account_validate
        account : czr_xxxxxxx 
        apikey  : 
  *  }
   返回：
    {
      "code": 100,
      "msg":ok,
      "result":true      /    false
    }
 */
async function account_validate(account){
  let rlt = await czr.request.accountValidate(account);
  return {
      "code":100,
      "msg":"ok",
      "result":rlt.valid?  true : false
  }
}



/** 
 * 接口：获取 单个账户 余额     
 * 参数:
     {
        module  : account
        action  : balance
        account : czr_account
        tag     : latest
        apikey  : YourApiKeyToken
      }
  * 返回
      {
        "status": "100",
        "message": "OK",
        "result": "649492854246559898951364"
    }
*/
//获取单个账户的余额
async function get_balance(query) {

  let listOptions = {
    text: "select balance from accounts where account = $1",
    values: [query.account]
  };
  const resList = await pgPromise.query(listOptions);
  return {
    "code": 100,
    "msg": "OK",
    "result": resList.rowCount? resList.rows[0].balance : "0"
  }
}

/** 
 * 接口：获取 多个账户 余额     
 * 参数:
     {
        module  : account
        action  : balance_multi
        account : czr_account1,czr_account2
        tag     : latest
        apikey  : YourApiKeyToken
      }
  * 返回
      {
        "code": 100,
        "msg": "OK",
        "result": [
            {
                "account": "czr_33EuccjKjcZgwbHYp8eLhoFiaKGARVigZojeHzySD9fQ1ysd7u",
                "balance": "1132623786600000000000000000"
            },
            {
                "account": "czr_3GmJUvqMF5XTxVXFvkLwNdKhj6LkixkqhmXgNgezuqUFg4QzKQ",
                "balance": "999999990904001198"
            }
        ]
      }
*/
//获取多个账户的余额
async function get_balance_multi(query) {
  let addressAry = query.account.split(',')
  let account_multi_rlt = {}
  addressAry.forEach(item =>{
    account_multi_rlt[item] = "0"
  })
  let listOptions = {
    text: "select account,balance from accounts where account = ANY ($1)",
    values: [addressAry]
  };
  const resList = await pgPromise.query(listOptions);
  if(resList.rowCount){
    resList.rows.forEach(item => {
      account_multi_rlt[item.account] = item.balance
    })
  }
  let account_multi_rlt_ary = [];
    Object.keys(account_multi_rlt).forEach(item=>{
      account_multi_rlt_ary.push({
        "account":item,
        "balance":account_multi_rlt[item]
      })
    })
  return {
    "code": 100,
    "msg": "OK", 
    "result": account_multi_rlt_ary
  }
}

/** 
 * 接口：获取 单个账户 的交易列表
* 参数:
    {
          module   : account
          action   : txlist
          account  : czr_account
          page     : 1
          limit    : 10
          sort     : desc  // desc | asc
          apikey   : YourApiKeyToken
    }
  * 返回
    {
        "code": 100,
        "msg": "OK",
        "result": [
            {
                hash: "C33E2B4C1BB8E0B87EC7E4EB3DDA73376DF20CE551B09205D4C03199A11FBBCF"
                from: "czr_3eHWaLn7FmxWEoDGxpW9mAXvDvqwaHVYxR9YQJ8wnYU8o81btP"
                to: "czr_4SfUV4Aysc6YCWLEJL8sCDRAaHPndXjVFE1r2mEc7TFcqEUR6a"
                amount: "0"
                is_stable: "1"
                mc_timestamp: "1560946863"
                stable_index: "6572"
                status: "0"
            }
        ]
    }
*/
//获取单个账户的交易列表Normal
async function tx_list(query) {
  
  let SORTVAL = (query.sort && query.sort.toLowerCase() === "desc") ? "DESC" : "ASC";
  let sql = {
    text: `select 
            "hash","from","to","amount","is_stable","mc_timestamp","stable_index","status","gas","gas_used","gas_price"
          from
            trans_normal  
          where 
            "from" = $1 or "to" = $1
          order by 
            mc_timestamp ${SORTVAL}   
          `,
    values: [query.account]
  }
  if (query.page) {
    let limitVal = Number(query.offset) || 10;
    let offsetVal = Number(query.page) ? (Number(query.page)-1) * limitVal : 0; 
    if(limitVal<0 || offsetVal<0){
      return{
        "code":400,
        "msg":"parameter page and offset must be positive"
      }
    }
    sql.text += `offset
                  $2
                limit
                  $3
                `;
    sql.values.push(offsetVal, limitVal);
  } else {
    sql.text += `
                limit
                  10000
                `;
  }
  let sqlrlt = await pgPromise.query(sql);

  return {
    "code": 100,
    "msg": "ok",
    "result": sqlrlt.rows
  }
}

/** 
 * 接口：获取 单个账户 的内部交易列表
* 参数:
    {
        module   : account
        action   : txlist_internal
        account  : czr_xx
        page     : 1
        limit    : 10
        sort     : desc      // desc | asc
        apikey   : YourApiKeyToken
    }
  * 返回
    {
        "code": 100,
        "msg": "OK",
        "result": [
            {
                "type": 0,  //call
                "action": {
                    "call_type": "call",
                    "from": "czr_4iig3fTcXQmz7bT2ztJPrpH8usrqGTN5zmygFqsCJQ4HgiuNvP",
                    "to": "czr_33EuccjKjcZgwbHYp8eLhoFiaKGARVigZojeHzySD9fQ1ysd7u",
                    "gas": "25000",
                    "input": "",
                    "value": "120000000000000000000"
                },
                "result": {
                    "gas_used": "21000",
                    "output": "",
                },  
                "subtraces":0,
                "trace_address": []
            }
        ]
    }
*/
//获取单个账户的交易列表Internal 
async function tx_list_internal(query) {
  
  let SORTVAL = (query.sort && query.sort.toLowerCase() === "desc") ? "DESC" : "ASC";
  let sql = {
    text: `select 
          "type", "call_type" ,"from","to","gas","input","value","gas_used","output","subtraces","trace_address"
          from
            trans_internal  
          where 
            "from" = $1 or "to" = $1
          order by 
            mc_timestamp ${SORTVAL}   
          `
    , 
    values: [query.account]
  }
  if (query.page) {
    let limitVal = Number(query.offset) || 10;
    let offsetVal = Number(query.page) ? (Number(query.page)-1) * limitVal : 0;
    if(limitVal<0 || offsetVal<0){
      return{
        "code":400,
        "msg":"parameter page and offset must be positive"
      }
    }
    sql.text += `offset
                  $2
                limit
                  $3
                `;
    sql.values.push(offsetVal, limitVal);
  } else {
    sql.text += `
                limit
                  10000
                `;
  }
  let sqlrlt = await pgPromise.query(sql);
  let retrlt = [];
  if(sqlrlt.rowCount){
    for(let i=0;i<sqlrlt.rowCount;i++){
      retrlt[i] = { "type": sqlrlt.rows[i].type,"subtraces":sqlrlt.rows[i].subtraces,"trace_address":sqlrlt.rows[i].trace_address.split('_')}
      retrlt[i].action = {
        "call_type": sqlrlt.rows[i].call_type,
        "from": sqlrlt.rows[i].from,
        "to": sqlrlt.rows[i].to,
        "gas": sqlrlt.rows[i].gas,
        "input": sqlrlt.rows[i].input,
        "value": sqlrlt.rows[i].value
      };
      retrlt[i].result = {
        "gas_used": sqlrlt.rows[i].gas_used,
        "output": sqlrlt.rows[i].output,
      };
    }
  }

  return {
    "code": 100,
    "msg": "ok",
    "result": retrlt
  }
}

/** 
 * 接口：获取单个账户的交易数量
* 参数:
    {
        module    : account
        action    : txlist_count
        account   : czr_xx
        apikey    : YourApiKeyToken
    }
  * 返回
    {
      "code": 100,
      "msg": "OK",
      "result": 2
  }
*/
//获取单个账户的交易数量
async function txlist_count(query){  
  
  let sql = `select count("from") from trans_normal where "from" = '${query.account}' or "to" = '${query.account}'` ;
  let res = await pgPromise.query(sql);
  return {
    "code": 100,
    "msg": "OK",
    "result": res.rows[0]['count']
  }
}

/** 
 * 接口：获取单个账户的CRC20余额
* 参数:
    {
        module   : account
        action   : balance_crc
        account  : czr_xx
        contract_account: (可选)czr_xx ,指定token账户
        apikey   : YourApiKeyToken
    }
  * 返回
    {
      "code": 100,
      "msg": "OK",
      "result": 2
  }
*/
//获取单个账户的CRC20余额
async function balance_crc(query){
  let sql = `select account,contract_account,'name',symbol,precision,balance from token_asset where account = '${query.account}'`
  if (query.contract_account){
    sql += ` and contract_account = '${query.contract_account}'`
    let rlt= await pgPromise.query(sql);
    return {
      "code": 100,
      "msg": "OK",
      "result": rlt.rowCount? rlt.rows[0]:0
    }
  }
  let rlt= await pgPromise.query(sql);
  return {
    "code": 100,
    "msg": "OK",
    "result": rlt.rows
  }
}

/** 
 * 接口：获取单个账户的CRC20余额
* 参数:
    {
        module          : account
        action          : txlist_crc
        account         : czr_xx
        contractaddress : czr_xx
        page            : 1
        limit           : 10
        sort            : desc, // desc | asc
        apikey          : YourApiKeyToken
    }
  * 返回
    {
        "code": 100,
        "msg": "OK",
        "result": [
            {
                "stable_index": "4572",
                "hash": "D440EC61C72FA4B6CE761F485A5E8282DE1D5CA93327E71DC1444D366E5511A8",
                "mc_timestamp": "1560942394",
                "from": "czr_33EuccjKjcZgwbHYp8eLhoFiaKGARVigZojeHzySD9fQ1ysd7u",
                "to": "czr_3juP4ekGuk66hA78XJb9XcJxCAaPff5a1K5W2eiehvmucjwotk",
                "contract_account": "czr_3juP4ekGuk66hA78XJb9XcJxCAaPff5a1K5W2eiehvmucjwotk",
                "token_symbol": "CCC",
                "amount": "1000"
            }
        ]
      }
*/
//获取单个账户的CRC20交易
async  function txlist_crc(query){

  let sort = (query.sort && query.sort.toLowerCase() === "desc") ? "DESC" : "ASC";
  let sql = { 
            text:
            `select 
                "stable_index","hash","mc_timestamp","from","to","contract_account","token_symbol","amount" 
            from 
              trans_token
            where
            ` + 
            (!query.contractaddress?`  "from" = '${query.account}' or "to" = '${query.account}' `:
            `  ( "from" = '${query.account}' or "to" = '${query.account}') and  "contract_account" = '${query.contractaddress}' `) +
            `order by 
              stable_index ${sort} 
            `}
  if (query.page) {
    let limitVal = Number(query.limit) || 10;
    let offsetVal = Number(query.page) ? (Number(query.page)-1) * limitVal : 0;
    if(limitVal<0 || offsetVal<0){
      return{
        "code":400,
        "msg":"parameter page and offset must be positive"
      }
    }
    sql.text += `offset
                  $1
                limit
                  $2
                `;
    sql.values = [offsetVal, limitVal];
  } else {
    sql.text += `limit
                  10000;
                `;
  }
  // return sql.text
  let rlt= await pgPromise.query(sql);
  return {
    "code": 100,
    "msg": "OK",
    "result": rlt.rows
  }
}


// ******************************** 账户模块 结束





// ******************************** 交易模块 开始


/** 
 * 接口：生成未签名的交易，返回交易详情，开发者需要签名后通过send_offline_block发送交易
* 参数:
    {
      module  : transaction
      action  : generate_offline_block
      previous：""                    可选 | 源账户的上一笔交易hash。可用于替换无法被打包的交易。
      from: "czr_account1"            源账户。
      to: "czr_account2"              目标账户。
      amount: "100000000000000"       金额，单位
      gas: "21000"                    执行交易使用的gas上限。未使用完的部分会返回源账户。
      gas_price: "1000000000000"      gas价格
      data: "496E204D617468"          可选 | 智能合约代码或数据，默认为空。
      apikey  : YourApiKeyToken
    }
  * 返回
    {
    "code": 100,
    "msg": "OK",
    "result": {
        "hash": "2CDB2DD9C1A8FC6C2EB5B9D6034E01CE9B0E4C04F8EEC7E9AB0D72DB0A111FDC",
        "previous": "A5E40538D4FA7505DDE81C538AAAB97142312E3FE3D606901E2C439967FE10F0",
        "from": "czr_33EuccjKjcZgwbHYp8eLhoFiaKGARVigZojeHzySD9fQ1ysd7u",
        "to": "czr_4m7NiSx2sBG4Hmdq1Yt6EGKqFQ3rmtBXCsmJZZp4E3pm84LkG9",
        "amount":"1000000000000000000", //1CZR
        "gas": "21000",
        "gas_price": "1000000000000",
        "data": "496E204D617468205765205472757374",
    }
*/
//生成离线交易
async function generate_offline_block(query){

  if(!query.from || !query.to){
    return {
      "code":400,
      "msg":"parameter from and to is required"
    }
  }
  let valid_from = await account_validate(query.from);
  let valid_to = await account_validate(query.to);
  if(!valid_from.result || !valid_to.result){
    return {
      "code":400,
      "msg":"from or to is invalid format"
    }
  }
  if(!(+query.amount >= 0 )){
    return{
      "code":400,
      "msg":"parameter amount is required and must not Negative"
    }
  }
  if(!( +query.gas >= 0)){
    return{
      "code":400,
      "msg":"parameter gas is required and must not Negative"
    }
  }
  if(!( +query.gas_price >= 0)){
    return{
      "code":400,
      "msg":"parameter gas_price is required and must not Negative"
    }
  }
  let transation  = {
    "from":query.from,
    "to":query.to,
    "amount":query.amount,
    "gas":query.gas,
    "gas_price":query.gas_price
  }
  if(query.previous){transation.previous=query.previous}
  if(query.data){transation.data=query.data}

  let czrRlt = await czr.request.generateOfflineBlock(transation)
  let retRlt = {}
  retRlt.code = czrRlt.code? 401:100
  retRlt.msg = czrRlt.msg
  if(!czrRlt.code){
    let rltAry = Object.keys(czrRlt)
    retRlt.result = {}
    for(let i=2;i<rltAry.length;i++){
      retRlt.result[rltAry[i]] = czrRlt[rltAry[i]]
    }
  }
  return retRlt
  
}

/** 
 * 接口：生成未签名的交易，返回交易详情，开发者需要签名后通过send_offline_block发送交易
* 参数:
    {
      module  : transaction
      action  : send_offline_block
      previous: "A5E40538D4FA7505DDE81C538AAAB97142312E3FE3D606901E2C439967FE10F0"
      from: "czr_account1"
      to: "czr_account2"
      amount: "1000000000000000000" 金额
      gas: "21000"
      gas_price: "1000000000000"
      data: "A2A98215E8DB2953"
      signature: "4AB..."         交易签名
      gen_next_work："1"          可选 | 是否为下一笔交易预生成work值，0：不预生成，1：预生成。默认为1。
      apikey  : YourApiKeyToken
    }
  * 返回
    {
    "code": "100",
    "msg": "OK",
    "result": {
        "code": 100,
        "msg": "OK",
        "result": "E8441A74FD40465006CC078C860323A0DFF32F23AC7E7F81A153F8ECE304439A"
    }
*/
//发送离线交易
async function send_offline_block(query) {
  //   {
  //     "action": "send_offline_block",
  //     "hash": "2CDB2DD9C1A8FC6C2EB5B9D6034E01CE9B0E4C04F8EEC7E9AB0D72DB0A111FDC",    
  //     "from": "czr_33EuccjKjcZgwbHYp8eLhoFiaKGARVigZojeHzySD9fQ1ysd7u",
  //     "to": "czr_4k1FXs5xvfYcKiikFeV3GtyMRqYMwbjatL5YVURqYf1KBgC8Mq",
  //     "amount": "1000000000000000000", //1CZR
  //     "gas": 1000,
  //     "data": "A2A98215E8DB2953",
  //     "previous": "0826EC6DDA9F818044BF66256D475DDC27C6862CDD80BB178380E80BE8C2314C",
  //     "signature": "4ABC0440DEC29AA49B6C1EEAE1D5C263B9856C218ACA4E9EDA0292FF3CBB6E85404F5266CD0B58CEF825E24EDF9C7F9A5B6FDCE415EF384C5AAF403D187ABF03",
  //     "gen_next_work":""//可选,是否为下一笔交易预生成work值，0：不预生成，1：预生成。默认为1。
  // }
  if(!query.from || !query.to){
    return {
      "code":400,
      "msg":"parameter from and to is required for generation"
    }
  }
  let valid_from = await account_validate(query.from);
  let valid_to = await account_validate(query.to);
  if(!valid_from.result || !valid_to.result){
    return {
      "code":400,
      "msg":"from or to is invalid format"
    }
  }
  if(!(+query.amount >= 0 )){
    return{
      "code":400,
      "msg":"parameter amount is required and must not Negative"
    }
  }
  if(!( +query.gas >= 0)){
    return{
      "code":400,
      "msg":"parameter gas is required and must not Negative"
    }
  }
  if(!( +query.gas_price >= 0)){
    return{
      "code":400,
      "msg":"parameter gas_price is required and must not Negative"
    }
  }
  if(!query.signature){
    return{
      "code":400,
      "msg":"parameter signature is required"
    }
  }
  if(!query.previous){
    return{
      "code":400,
      "msg":"parameter previous is required"
    }
  }
  let options = {
    "from": query.from,
    "to": query.to,
    "amount": query.amount,
    "gas": query.gas,
    "gas_price":query.gas_price,
    "signature": query.signature,
  }
  if(query.data){options["data"]=query.data};
  if(query.gen_next_work){options["gen_next_work"]=query.gen_next_work};
  if(query.previous){options["previous"]=query.previous};

  let res = await czr.request.sendOfflineBlock(options);
  console.log("res.code:",res.code)
  res.code = res.code? 401: 100
  return res;
}

/** 
 * 接口：生成未签名的交易，返回交易详情，开发者需要签名后通过send_offline_block发送交易
* 参数:
    {
      module  : transaction
      action  : details
      hash    : HASH
      apikey  : YourApiKeyToken
    }
  * 返回
    {
        "code": 100,
        "msg": "OK",
        "result": {
        "hash": "C33E2B4C1BB8E0B87EC7E4EB3DDA73376DF20CE551B09205D4C03199A11FBBCF",
        "type": "2",
        "from": "czr_3eHWaLn7FmxWEoDGxpW9mAXvDvqwaHVYxR9YQJ8wnYU8o81btP",
        "to": "czr_4SfUV4Aysc6YCWLEJL8sCDRAaHPndXjVFE1r2mEc7TFcqEUR6a",
        "amount": "0",
        "gas": "3000000",
        "gas_price": "1000000000",
        "gas_used": "21272",
        "data": "1FC376F7",
        "is_stable": "1",
        "status": "0",
        "mc_timestamp": "1560946863",
        "stable_timestamp": "1560946868"
    }
*/
//获取交易详情
async function get_transaction_by_hash(query) {
  //校验
  if (!query.hash) {
    return {
      "code": 400,
      "msg": "Parameter missing txhash"
    }
  }
  if(invalidTxHash(query.hash)){
    return {
      "code":400,
      "msg": "invalid txhash"
    }
  }
  let transTypeSQL = `select "type" from trans_type where "hash" = '${query.hash}'`
  let transType = await pgPromise.query(transTypeSQL)
  if (!transType.rowCount){
    return {
      "code":100,
      "msg":"transaction not exist" 
    }
  }
  let listOptions = {};
  let transDetail;
  if (transType.rows[0].type == "0"){
    console.log('trans_genesis')
    listOptions =`select 
                      "hash", "type","from","to","amount","gas_used","data","timestamp","is_stable","status","mc_timestamp","stable_timestamp"
                  from
                    trans_genesis
                  where
                    "hash" = '${query.hash}'
                  `
    transDetail = await pgPromise.query(listOptions);
    transDetail.rows[0]['gas'] = 0;
    transDetail.rows[0]['gas_price'] = 0;
  }else if(transType.rows[0].type == "1"){
    console.log('trans_witness')
    listOptions =`select 
                      "hash", "type","from","is_stable","status","timestamp","mc_timestamp","stable_timestamp"
                  from
                    trans_witness
                  where
                    "hash" = '${query.hash}'
                  `
    transDetail = await pgPromise.query(listOptions);
    transDetail.rows[0]['gas'] = '';
    transDetail.rows[0]['gas_price'] = '';
    transDetail.rows[0]['gas_used'] = '';
    transDetail.rows[0]['to'] = '';
    transDetail.rows[0]['amount'] = '';
    transDetail.rows[0]['data'] = '';
    transDetail.rows[0]['is_stable'] = '';
  }else{
    console.log('trans_normal')
    listOptions =`select 
                      "hash", "type","from","to","amount","gas","gas_price","gas_used","data","is_stable","status","mc_timestamp","stable_timestamp"
                  from
                    trans_normal
                  where
                    "hash" = '${query.hash}'
                  `
    transDetail = await pgPromise.query(listOptions);
  }
  return {
    "code":100,
    "msg":"ok",
    "result":transDetail.rows
  }
}


// ******************************** 交易模块 结束




// ******************************** 其他模块 开始

/** 
 * 接口：生成未签名的交易，返回交易详情，开发者需要签名后通过send_offline_block发送交易
* 参数:
    {
      module      : other
      action      : gas_price
      tag         : latest
      apikey      : YourApiKeyToken
    }
  * 返回
    {
        "code": 100,
        "msg": "OK",
        "result": {
            cheapest_gas_price:"10000",
            median_gas_price:"15000",
            highest_gas_price:"20000"
        }
    }
*/
//获取CZRGas
async function CZRGas(query) {
  let querySql = {
    text: `
    SELECT 
        "cheapest_gas_price",
        "median_gas_price",
        "highest_gas_price"
    FROM 
        gas_price 
    order by
      timestamp desc
    limit
        1
    `
  };
  let rlt = await pgPromise.query(querySql);
  if (rlt.rows[0]) {
    return {
      "code": 100,
      "msg": "ok",
      "result": rlt.rows[0]
    };
  } else {
    return {
      "code": 404,
      "msg": "not found",
      "result": {}
    };
  }

}

/** 
 * 接口：生成未签名的交易，返回交易详情，开发者需要签名后通过send_offline_block发送交易
* 参数:
    {
        module      : other
        action      : estimate_gas
        tag         : latest
        apikey      : YourApiKeyToken
    }
  * 返回
    {
        "code": 100,
        "msg": "OK",
        "result": "21272"
    }
*/
//获得估算Gas
async function get_estimate_gas(query){
  let call_obj = {
    "from": query.from || '',
    "to": query.to || '',
    "amount": query.amount || '', //1CZR
    "gas": query.gas || '',
    "gas_price": query.gas_price || '',
    "data": query.data || '',
    "mci": query.mci || ''
  }
  let rlt = await czr.request.estimateGas(call_obj)
  return {
    "code": 100,
    "msg": rlt.msg,
    "result": rlt.gas
  }

}

/** 
 * 接口：生成未签名的交易，返回交易详情，开发者需要签名后通过send_offline_block发送交易
* 参数:
    {
        module      : other
        action      : to_hex
        source      : czr_account
        apikey      : YourApiKeyToken
    }
  * 返回
    {
        "code": 100,
        "msg": "OK",
        "result": "637a725f6163636f756e74"
    }
*/
//字符串转16进制
async function bs582hex(query){
  if(!query.source){
    return{
      "code": 400,
      "msg": "parameter missing source"
    }
  }
  let source_valid = await account_validate(query.source)
  if(!source_valid.result){
    return{
      "code": 400,
      "msg": "parameter source is not a czr address"
    }
  }
  let buf = bs58check.decode(query.source.split('_')[1])
  buf = buf.slice(1,)
  return {
    "code": 100,
    "msg": "ok",
    "result": buf.toString('hex')
  }
}

// ******************************** 其他模块 结束






router.get('/', async function (ctx, next) {
  let query = ctx.query;
  // 验证 apikey 类型，以及是否合法 
  if (!query.apikey) {
    ctx.body = {
      "code": 400,
      "msg": "parameter apikey is not found",
    }
    return;
  } else {
    let unfind = true;
    allApikeys.forEach(item => {
      if (item == query.apikey) {
        unfind = false
      }
    })
    if (unfind) {
      ctx.body = {
        "code": 400,   
        "msg": "inValid Apikey Value",
      }
      return;
    }
  }
  //验证 action
  if (!query.action) {
    ctx.body = {
      "code": 400,
      "msg": "parameter action is not found",
    }
    return;
  }

  //根据 action和module 做相应处理 


  //账户部分
  if (query.module == 'account'){
    if(!query.account){
      ctx.body = {
        "code": 400,
        "msg": "missing account parameter"
      }
      return ;
    }

    if(query.action === "account_validate"){
      ctx.body = await account_validate(query.account); 
      return ;
    }

    if(query.action === 'account_balance_multi'){
      let acctAry = query.account.split(',');
      if(acctAry.length>20){
        ctx.body = {
          "code":400,
          "msg":"the numbers of account must be less than 20",
        }
        return ;
      }
      for(let i=0;i<acctAry.length;i++){
        let acct_valid = await account_validate(acctAry[i])
        if(!acct_valid.result){
          ctx.body = {
            "code":400,
            "msg":"invalid account:"+acctAry[i],
            "result":[]
          }
          return ;
        }
      }
    }else{
      let acct_valid = await account_validate(query.account)
      if(!acct_valid.result){
        ctx.body = {
          "code":400,
          "msg":"invalid account",
          "result":query.account
        }
        return ;
      }
    }
    switch (query.action) {
      case 'account_balance':
        ctx.body = await get_balance(query);
        break;
      case 'account_balance_multi':
        ctx.body = await get_balance_multi(query);
        break;
      case 'account_txlist':
        ctx.body = await tx_list(query);
        break;
      case 'account_txlist_internal':
        ctx.body = await tx_list_internal(query);
        break;
      case 'account_txlist_count':
        ctx.body = await txlist_count(query);
        break;
      case 'account_balance_token':
        ctx.body = await balance_crc(query);
        break;
      case 'account_txlist_token':
        ctx.body =await txlist_crc(query);
        break;
      default:
        ctx.body = {
          "code":403,
          "msg":"this action is not available in account module",
        }
    }
  }

  //交易部分
  else if(query.module == 'transaction'){

    switch (query.action) {
      case 'tx_offline_generation':
      ctx.body = await generate_offline_block(query);
      break;
    case 'tx_offline_sending':
      ctx.body = await send_offline_block(query);
      break;
    case 'tx_details':
      ctx.body = await get_transaction_by_hash(query);
      break;
    default:
        ctx.body = {
          "code":403,
          "msg":"this action is not available in transaction module",
        }
    }
  }

  //其他部分
  else if(query.module =='other'){
    switch (query.action) {
      case 'gas_price':
        ctx.body = await CZRGas(query);
        break;
      case 'estimate_gas':
        ctx.body = await get_estimate_gas(query);
        break;
      case 'to_hex':
        ctx.body = await bs582hex(query);
        break;
      default:
        ctx.body = {
          "code":403,
          "msg":"this action is not available in other module",
        }
    }
  }

  //module 缺失
  else{
    ctx.body = {
      "code": 500,
      "msg": "this module is not available",
    }
  }
});

updtAPikeys();
// setInterval(updtAPikeys, intval2getApikeys);

module.exports = router