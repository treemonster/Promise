/***********************************************************
  Author: treemonster <https://www.xdelve.com>
  Latest: 2016-2-2
  API Reference: <https://www.promisejs.org/api/>
***********************************************************/
(function(){
// translate arguments object to array
var slice=function(args,begin,length){
  return Array.prototype.slice.call(args,begin||0,length||args.length);
};
// executing the callback in next tick
var setImmediate=function(h){
  var t=this,a=slice(arguments,1);
  return setTimeout(function(){ h.apply(t,a); },0);
};
// get stack of thenable
var getstack=function(){
  var stack;
  try{0()}catch(e){stack=e}
  return stack;
};

// Promise constructor
var Promise=function(executor){
  if(!this || this.constructor!==Promise)
    throw 'Promise can only constructed by `new` operator';
  if(typeof executor!=='function')
    throw 'Promise executor should be a function';
  var State={
    // callbacks passing from `then` will queue to resolvers
    resolvers:[],
    // callbacks passing from `catch` will queue to catches
    catches:[],
    // value is the result or reason of the current promise
    value:undefined,
    // pending => 0, resolving => 0b101, rejecting => 0b110, resolved => 0b01, rejected => 0b10
    status:0
  };
  // debugger exports
  this.toString=function(){
    return new(function Promise(){
      this['[[PromiseStatus]]']=['pending','resolved','rejected',0,'resolving','rejecting'][State.status];
      this['[[PromiseValue]]']=State.value;
    });
  };
  // executeing resolvers
  var nextTick=function(){
    if(!State.status || !State.resolvers.length)return;
    State.resolvers.shift()[(State.status&3)===2?1:0](State.value);
    setImmediate(nextTick);
  };
  this['catch']=function(onReject){
    State.catches.push(onReject);
    return this.then();
  };
  this['finally']=function(f){
    return this.then(
      function(value){
        return Promise.resolve(f()).then(function(){
          return value;
        });
      },
      function(reason){
        return Promise.resolve(f()).then(function(){
          throw reason;
        });
      }
    );
  };
  this.then=function(onResolve,onReject){
    var err=getstack();
    return new Promise(function(resolve,reject){
      var hook=function(isReject){
        return function(result){
          // remove the sign of status
          State.status&=3;
          var handle=isReject ?onReject||State.catches.shift() :onResolve;
          try{
            handle && (result=handle(result)) instanceof Promise?
              result.then(resolve,reject):
              (isReject && !handle?reject:resolve)(result);
          }catch(e){
            if(e instanceof Error)
              e.PromiseStack=err;
            reject(e);
          }
        }
      };
      State.resolvers.push([hook(),hook(true)]);
      setImmediate(nextTick);
    });
  };
  this.done=function(onResolve,onReject){
    this.then(onResolve,onReject).then(null,function(e){
      throw e;
    });
  };
  this.nodeify=function(callback,ctx){
    if(typeof callback!=='function')return this;
    this.then(
      function(value){
        setImmediate(function(){
          callback.call(ctx,null,value);
        });
      },
      function(reason){
        setImmediate(function(){
          callback.call(ctx,reason);
        });
      }
    );
  };
  var hook=function(status){
    return function(result){
      if(State.status)return;
      // sign the status as `resolving` or `rejecting`
      status|=4;
      State.value=result;
      State.status=status;
      setImmediate(nextTick);
      // if the status of current promise is `rejecting` and no `thenable` to catch it, throw an exception
      setImmediate(function(){
        if((State.status&6)===6)
          throw State.value;
      });
    };
  };
  var stack=getstack();
  // executing asynchronously
  setImmediate(function(resolve,reject){
    try{ executor(resolve,reject); }catch(e){
      if(e instanceof Error)
        e.PromiseStack=stack;
      reject(e);
    }
  },hook(1),hook(2));
};

(function(resolver){
  Promise.resolve=function(value){ return resolver(value); };
  Promise.reject=function(reason){ return resolver(reason,true); };
})(function(value,isReject){
  return value instanceof Promise ?value :new Promise(function(resolve,reject){
    setImmediate(function(){
    (value && value.then instanceof Function) ?
      value.then(resolve,reject):
      (isReject?reject(value):resolve(value));
    });
  }).then();
});

(function(iterator){
  Promise.all=function(iterable){ return iterator(iterable); };
  Promise.race=function(iterable){ return iterator(iterable,true); };
})(function(iterable,isRace){
  var n=iterable.length,result=[];
  if(!(iterable instanceof Array))
    throw 'iterable should be array';
  return new Promise(function(resolve,reject){
    for(var i=n;i--;)(function(i){
      Promise.resolve(iterable[i])['catch'](reject)
      .then(function(value){
        if(isRace)return resolve(value);
        result[i]=value;
        !--n && resolve(result);
      },reject);
    })(i);
    iterable.length || resolve(isRace?undefined:result);
  });
});

Promise.denodeify=function(fn,length){
  var ctx=this;
  return function(){
    var a=slice(arguments,0,length||arguments.length);
    return new Promise(function(resolve,reject){
      a.push(function(e){
        e?reject(e):resolve(slice(arguments,1));
      });
      fn.apply(ctx,a);
    });
  };
};

// defer
Promise.defer=function(){
  var p_resolve,p_reject,p_type,p_result,p_handler;
  var promise=new Promise(function(resolve,reject){
    callback(resolve,reject);
  });
  var callback=function(a,b,c,d){
    a?(p_resolve=a,p_reject=b):(p_type=c,p_result=d);
    if(p_type)p_handler=p_type==='resolve'?p_resolve:p_reject;
    p_handler && p_handler(p_result);
  };
  return {
    promise: promise,
    resolve: function(value){ callback(0,0,'resolve',value); },
    reject: function(reason){ callback(0,0,'reject',reason); }
  };
};

Promise.toString=function(){ return 'Promise() { [native code] }'; };
Promise.prototype.then=Promise.prototype['catch']=Promise.prototype['finally']=Promise.prototype['done']=Promise.prototype['nodeify']=function(){};

var _global;
switch(true){
  case typeof window!=='undefined': _global=window; break;
  case typeof global!=='undefined': _global=global; break;
  default: throw new Error('Unknown javascript environment');
}_global.Promise=Promise;

if(typeof define!=='undefined' && define.amd)
  define('Promise',function(){return Promise;});
if(typeof module==='object' && !!module.exports)
  module.exports=Promise;

})();
