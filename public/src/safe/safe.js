(async() => {(async() => {(async() => {(async() => {(async() => {(async() => {
    const t = setInterval(() => {
        for (const item of [
            Function.prototype.bind, Function.prototype.call, Function.prototype.apply,
            Function.prototype.toString, Object.prototype.hasOwnProperty,
            Object.prototype.isPrototypeOf, Object.prototype.propertyIsEnumerable,
            Object.prototype.toString, Object.prototype.valueOf, Object.getOwnPropertyNames,
            Object.getOwnPropertySymbols, Object.getPrototypeOf, Object.setPrototypeOf,
            Object.keys, Object.values, Object.entries, Object.assign, Object.defineProperty,
            Object.defineProperties, Object.freeze, Object.seal, Array.prototype.push,
            Array.prototype.pop, Array.prototype.shift, Array.prototype.unshift,
            Array.prototype.slice, Array.prototype.splice, Array.prototype.map,
            Array.prototype.filter, Array.prototype.reduce, Array.prototype.forEach,
            Array.prototype.find, Array.prototype.indexOf, Array.prototype.includes,
            Array.prototype.join, Array.prototype.concat, String.prototype.toString,
            String.prototype.valueOf, String.prototype.charAt, String.prototype.charCodeAt,
            String.prototype.concat, String.prototype.indexOf, String.prototype.lastIndexOf,
            String.prototype.replace, String.prototype.split, String.prototype.substring,
            String.prototype.toLowerCase, String.prototype.toUpperCase, String.prototype.trim,
            String.prototype.includes, String.prototype.startsWith, String.prototype.endsWith,
            Number.prototype.toString, Number.prototype.valueOf, Number.prototype.toFixed,
            Number.prototype.toExponential, Number.prototype.toPrecision, Date.prototype.toString,
            Date.prototype.toISOString, Date.prototype.getTime, Date.prototype.valueOf,
            RegExp.prototype.test, RegExp.prototype.exec, RegExp.prototype.toString,
            JSON.stringify, JSON.parse, Promise.prototype.then, Promise.prototype.catch,
            Promise.prototype.finally, Promise.resolve, Promise.reject, Promise.all,
            Promise.race, 
            window.fetch,  // 动态获取当前的 fetch
            window.Request,
            window.Response,
            window.Headers,
            window.XMLHttpRequest,
            window.XMLHttpRequest.prototype.open,
            window.XMLHttpRequest.prototype.send,
            window.XMLHttpRequest.prototype.setRequestHeader,
            window.XMLHttpRequest.prototype.abort
        ]) {
            if (typeof item === 'function' && item.toString().includes('[native code]')) continue;
            document.body.innerHTML = '';
            clearInterval(t);
            window.stop();
        }
    },1000);
})();})();})();})();})();})();
(async() => {(async() => {(async() => {(async() => {(async() => {(async() => {
    const check = (proto) => {
        const whitelist = new Set([
            'constructor', '__proto__', 'toString', 'hasOwnProperty',
            'isPrototypeOf', 'propertyIsEnumerable', 'valueOf',
            'toLocaleString', '__defineGetter__', '__defineSetter__',
            '__lookupGetter__', '__lookupSetter__',
            'length', 'name', 'apply', 'bind', 'call', 
            'arguments', 'caller', 'prototype',
            'then', 'catch', 'finally', 'at', 'concat', 'copyWithin', 
            'fill', 'find', 'findIndex', 'findLast', 'findLastIndex', 
            'lastIndexOf', 'pop', 'push', 'reverse', 'shift', 'unshift', 
            'slice', 'sort', 'splice', 'includes', 'indexOf', 'join', 
            'keys', 'entries', 'values', 'forEach', 'filter', 'flat', 
            'flatMap', 'map', 'every', 'some', 'reduce', 'reduceRight', 
            'toReversed', 'toSorted', 'toSpliced', 'with'
        ]);
        const symbolWhitelist = new Set([
            'Symbol.iterator', 'Symbol.toStringTag', 'Symbol.hasInstance',
            'Symbol(Symbol.hasInstance)', 'Symbol(Symbol.iterator)', 
            'Symbol(Symbol.unscopables)'
        ]);
        for (const key of Object.getOwnPropertyNames(proto)) {
            if (!whitelist.has(key)) {
                clearInterval(t);
                document.body.innerHTML = '';
                window.stop();
            }
        }
        for (const sym of Object.getOwnPropertySymbols(proto)) {
            if (!symbolWhitelist.has(sym.toString())) {
                clearInterval(t);
                document.body.innerHTML = '';
                window.stop();
            }
        }
    };
    const t = setInterval(() => {
        check(Object.prototype);
        check(Function.prototype);
        check(Array.prototype);
    },1000)
})();})();})();})();})();})();