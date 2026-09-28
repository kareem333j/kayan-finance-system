import Decimal from 'decimal.js';
/** Decimal-only arithmetic. No JavaScript evaluation, properties, strings or side effects. */
export function evaluateExpression(source:string,resolve:(name:string)=>Decimal.Value):Decimal {
  if(!source.trim()||source.length>500)throw new Error('المعادلة فارغة أو أطول من 500 حرف');
  const normalized=source.replace(/Math\.(min|max|round|abs|ceil|floor)/g,(_,f:string)=>f.toUpperCase()).replace(/×/g,'*').replace(/÷/g,'/');
  const tokens=normalized.match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|[()+\-*/,]/g)||[];
  if(tokens.join('')!==normalized.replace(/\s/g,''))throw new Error('المعادلة تحتوي رموزًا غير مسموحة');
  if(tokens.length>150)throw new Error('المعادلة معقدة أكثر من الحد المسموح');let pos=0,depth=0;
  const expression=(min=0):Decimal=>{if(++depth>30)throw new Error('تداخل المعادلة أكبر من المسموح');let left:Decimal;const token=tokens[pos++];
    if(token==='+'||token==='-'){const v=expression(3);left=token==='-'?v.neg():v;}
    else if(token==='('){left=expression();if(tokens[pos++]!==')')throw new Error('قوس إغلاق مفقود');}
    else if(token&&/^\d/.test(token))left=new Decimal(token);
    else if(token&&/^[A-Za-z_]/.test(token)){
      if(tokens[pos]==='('){pos++;const args:Decimal[]=[];if(tokens[pos]!==')'){do{args.push(expression());if(tokens[pos]!==',')break;pos++;}while(true);}if(tokens[pos++]!==')')throw new Error('قوس الدالة غير مكتمل');
        switch(token.toUpperCase()){
          case 'MIN':case 'MAX':if(args.length<2||args.length>10)throw new Error('MIN وMAX تحتاجان قيمتين على الأقل');left=token.toUpperCase()==='MIN'?Decimal.min(...args):Decimal.max(...args);break;
          case 'ABS':case 'CEIL':case 'FLOOR':if(args.length!==1)throw new Error('الدالة تحتاج قيمة واحدة');left=token.toUpperCase()==='ABS'?args[0].abs():token.toUpperCase()==='CEIL'?args[0].ceil():args[0].floor();break;
          case 'ROUND':if(args.length<1||args.length>2)throw new Error('ROUND تحتاج قيمة ودقة اختيارية');const places=args[1]?.toNumber()??0;if(!Number.isInteger(places)||places<0||places>6)throw new Error('دقة ROUND بين صفر و6');left=args[0].toDecimalPlaces(places,Decimal.ROUND_HALF_UP);break;
          default:throw new Error(`دالة غير مسموحة: ${token}`);
        }
      }else left=new Decimal(resolve(token));
    }else throw new Error('المعادلة غير مكتملة');
    while(pos<tokens.length){const op=tokens[pos];const precedence=op==='+'||op==='-'?1:op==='*'||op==='/'?2:0;if(!precedence||precedence<=min)break;pos++;const right=expression(precedence);if(op==='/'&&right.isZero())throw new Error('قسمة على صفر');left=op==='+'?left.plus(right):op==='-'?left.minus(right):op==='*'?left.mul(right):left.div(right);if(!left.isFinite()||left.abs().gt('1e15'))throw new Error('نتيجة المعادلة تتجاوز الحد المسموح');}
    depth--;return left;
  };
  const result=expression();if(pos!==tokens.length)throw new Error('رموز إضافية بعد نهاية المعادلة');return result;
}
