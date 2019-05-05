
const request = require('../utility').request;
const moment = require('moment-timezone');
const FXQuote = require('./fx');
const meta = require('../metadata').metadata.data;

class CryptoQuote {
    constructor(td) {
        this.provider = 'cryptocompare'; //cryptocompare, coinmarketcap
        this.td = td;
    }

    withProvider(provider){
        this.provider = provider;
        return this;
    };

    isInTradingHours(q) {
        const category = '4';
        let cat = meta.categories[category];
        let th = meta.categories[category].tradingHours;
        let current = moment.tz(cat.timeZone);
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

    async quotes(symbols) {
        if(this.provider === undefined || this.provider === '')
            this.provider = 'cryptocompare';

        switch (this.provider.toLowerCase()) {
            case 'cryptocompare': {
                let f;
                let arr = [];
                let fxPairs = await new FXQuote().quotesAll();

                let cryptoCurs = new Set(symbols.map(m => m.split('.')[0].toUpperCase().replace("TBC", 'ETH')));
                if(symbols.some(m => m.split('.')[1].toUpperCase() === 'TBC'))
                    cryptoCurs.add('ETH');
                let cryptoQuotes = new Map();
                for(let cyp of cryptoCurs){
                    const cryptoURL = `https://min-api.cryptocompare.com/data/price?fsym=${cyp}&tsyms=USD`;
                    request('GET', cryptoURL).then(body =>
                        cryptoQuotes.set(cyp, JSON.parse(body.body.toString('utf-8'))))
                }
                this.td.query_token_price(1, 1).then(async longPrice => {
                    let shortPrice = longPrice;
                    let itv = setInterval(() => {
                        if(cryptoQuotes.size >= cryptoCurs.size){
                            clearInterval(itv);
                            for(let symbol of symbols){
                                let crypto = symbol.split('.')[0].toUpperCase();
                                let c = crypto === 'TBC' ? 'ETH' : crypto;
                                let fiat = symbol.split('.')[1].toUpperCase();
                                let json = cryptoQuotes.get(c);

                                let fxRate;
                                switch(fiat){
                                    case 'CNY':
                                        fxRate = fxPairs.find(f => f.symbol === 'USD.CNY.FX');
                                        break;
                                    case 'JPY':
                                        fxRate = fxPairs.find(f => f.symbol === 'USD.JPY.FX');
                                        break;
                                    case 'USD':
                                        fxRate = {bid: 0.9975, ask: 1.0025, middle: 1};
                                        break;
                                    case 'TBC':
                                        fxRate = {middle: 1 / cryptoQuotes.get('ETH')['USD'] * (shortPrice / 1e6)};
                                        fxRate.bid = fxRate.middle * 0.9975;
                                        fxRate.ask = fxRate.middle * 1.0025;
                                        break;
                                    default:
                                        fxRate = JSON.parse(JSON.stringify(fxPairs.find(f => f.symbol === `${fiat}.USD.FX`)));
                                        ['bid', 'ask', 'middle'].forEach(f => fxRate[f] = 1 / fxRate[f]);
                                        break;
                                }

                                if (crypto === 'TBC') {
                                    let re = {
                                        moment: moment.tz('UTC'),
                                        crypto: 'TBC',
                                        fiat: fiat,

                                        rate: Number(json['USD']) * fxRate.middle,
                                        bid: Number(json['USD']) * fxRate.bid,
                                        ask: Number(json['USD']) * fxRate.ask
                                    };
                                    re.rate = Number((re.rate / ((longPrice / 1e6 + shortPrice / 1e6) / 2)).toFixed(4));
                                    re.bid = Number((re.bid / (longPrice / 1e6)).toFixed(4));
                                    re.ask = Number((re.ask / (shortPrice / 1e6)).toFixed(4));

                                    arr.push(re);
                                }else{
                                    arr.push({
                                        moment: moment.tz('UTC'),
                                        crypto: crypto,
                                        fiat: fiat,

                                        rate: Number((Number(json['USD']) * fxRate.middle).toFixed(4)),
                                        bid: Number((Number(json['USD']) * fxRate.bid).toFixed(4)),
                                        ask: Number((Number(json['USD']) * fxRate.ask).toFixed(4))
                                    });
                                }
                            }
                            f(arr.filter(f => !isNaN(f.rate)).map(m => {m.symbol = `${m.crypto.toUpperCase()}.${m.fiat.toUpperCase()}.CRYPTO`; m.quote = m.rate; m.timestamp = Number(m.moment.format('x')); return m}));
                        }
                    }, 100);
                });

                return new Promise(t => f = t);
                }
            default:
                return Promise.reject(`currently provider ${this.provider} is UNSUPPORTED!`);
        }
    }
}

module.exports = CryptoQuote;