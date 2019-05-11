const request = require('../utility').request;
const moment = require('moment-timezone');
const meta = require('../metadata').metadata.data;

class CNCCommodities {
    constructor() {
        this.provider = 'sina_api';
    }

    withProvider(provider){
        this.provider = provider;
        return this;
    };

    isInTradingHours(qMoment) {
        if(qMoment === null)
            return false;
        const category = '5';
        let cat = meta.categories[category];
        let th = meta.categories[category].tradingHours;
        let current = moment.tz(cat.timeZone);
        if(qMoment.add(5, 'minutes').isBefore(current))
            return false;
        if(qMoment.startOf('day').isBefore(current.startOf('day')))
            return false;
        if(th.day.indexOf(current.format('ddd').toLowerCase()) < 0)
            return false;
        if(th.dayOff.indexOf(current.format('YYYYMMDD')) >= 0)
            return false;
        return th.time.map(m => {
            let start = moment.tz(`${current.format('YYYYMMDD')}T${m.split('-')[0].replace(':', '')}`, cat.timeZone);
            let end =   moment.tz(`${current.format('YYYYMMDD')}T${m.split('-')[1].replace(':', '')}`, cat.timeZone);
            return current.isAfter(start) && current.isBefore(end)
        }).reduce((r,a) => {r = r || a; return r}, false);
    };

    async quotes(sybmols) {
        if(this.provider === undefined || this.provider === '')
            this.provider = 'sina_api';

        switch (this.provider.toLowerCase()) {
            case 'sina_api':
                const apiURL = 'http://hq.sinajs.cn/list=';
                let s = sybmols.map(m => {
                    return (m.match(meta.categories['5'].symbols[0]) || [''])[0].replace('.CNC', '')
                });
                let body;
                try{
                    let rsp = await request('GET', apiURL + s.filter(f => f !== '').join(','));
                    body = rsp.body.toString('gbk');
                }catch (err){
                    return new Error('error in retrieving info')
                }

                let quotes = [];
                body.split(';\n').map(line => {
                    let q = {};
                    let symbol = (line.split('=')[0] || '').replace('var hq_str_', '');
                    let fields = (line.split('=')[1] || '').split(',');
                    if(fields.length >= 17){
                        q.symbol = symbol + '.CNC';
                        q.time = fields[1];
                        q.open = Number(fields[2]);
                        q.high = Number(fields[3]);
                        q.low = Number(fields[4]);
                        q.prevClose = Number(fields[5]);
                        q.bid = Number(fields[6]);
                        q.ask = Number(fields[7]);
                        q.quote = Number(fields[8]) === 0 ? Number(fields[5]) : Number(fields[8]);
                        q.settlement = Number(fields[9]);
                        q.prevSettlement = Number(fields[10]);
                        q.bidVol1 = Number(fields[11]);
                        q.askVol1 = Number(fields[12]);
                        q.OI = Number(fields[13]);
                        q.volume = Number(fields[14]);
                        q.exchange = fields[15];
                        q.name = fields[16];
                        q.date = fields[17];
                        q.percent = q.prevClose === 0 ? 0 : q.quote / q.prevClose - 1;
                        q.moment = moment(q.date + ' ' + q.time, "YYYY-MM-DD HHmmss").tz(meta.categories[5].timeZone);
                        q.timestamp =  Number(q.moment.format('x'));
                        quotes.push(q);
                    }
                });

                return quotes;
            default:
                return new Error(`currently provider ${this.provider} is UNSUPPORTED!`);
        }
    }
}

module.exports = CNCCommodities;