#!/bin/sh
# كسر التخزين: اختم نسخة جديدة في app/index.html قبل كل نشر يمس تطبيق الويب.
# GitHub Pages يخزن كل ملف عشر دقائق؛ الوسم الجديد في الوثيقة (التي يعيد
# المتصفح التحقق منها عند كل تحديث عادي) يجرّ بقية الملفات طازجة فورًا.
cd "$(dirname "$0")"

# حارس impeccable: وسم المعاينة الحية يشير إلى localhost ولا يجوز أن يُنشر.
if grep -rl "live.js?token" --include="*.html" . 2>/dev/null | grep -v node_modules; then
  echo "خطأ: وسم معاينة impeccable الحية ما زال محقونًا أعلاه — شغّل stop قبل النشر." >&2
  exit 1
fi

# بوابة فرق الوكلاء: لا يُنشر عملٌ غيّر سلوك وكيل ولم يظهر في صفحة المدير.
if [ -f "$HOME/Projects/souvenir/Tools/gate_teams_sync.py" ]; then
  python3 "$HOME/Projects/souvenir/Tools/gate_teams_sync.py" || exit 1
fi

V=$(date +%s)
sed -i '' -E "s/\?v=[0-9]+/?v=$V/g" app/index.html
echo "stamped v=$V"
