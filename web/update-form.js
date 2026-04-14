const fs = require('fs');
const file = '/Users/shauddin/Desktop/MandiPro/web/components/inventory/quick-consignment-form.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Update onChange for commission
content = content.replace(
    `<Input
                                                                type="number"
                                                                {...field}
                                                                className="h-10 md:h-14 bg-white border-slate-200 text-black font-black text-center text-lg rounded-xl focus:ring-4 focus:ring-purple-500/10 shadow-sm transition-all"
                                                            />`,
    `<Input
                                                                type="number"
                                                                {...field}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value) || 0;
                                                                    field.onChange(val);
                                                                    if (val > 0) {
                                                                        if (form.getValues(\`rows.\${index}.arrival_type\`) === 'direct') {
                                                                            form.setValue(\`rows.\${index}.arrival_type\`, 'commission');
                                                                        }
                                                                    } else {
                                                                        form.setValue(\`rows.\${index}.arrival_type\`, 'direct');
                                                                    }
                                                                }}
                                                                className="h-10 md:h-14 bg-white border-slate-200 text-black font-black text-center text-lg rounded-xl focus:ring-4 focus:ring-purple-500/10 shadow-sm transition-all"
                                                            />`
);

// 2. Replace Tabs block
const startMarker = '                                    {/* Tabbed Interface for Row Details */}';
const endMarker = '                                        </Tabs>\n                                    </div>';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker) + endMarker.length;

if (startIndex > -1 && endIndex > startIndex) {
    const replacement = `                                    {/* Deductions & Notes Panel */}
                                    <div className="mt-6 border border-slate-100 rounded-[28px] p-6 bg-slate-50/50">
                                        <div className="flex flex-col md:flex-row items-center justify-between mb-6 pb-4 border-b border-slate-100/50 gap-4">
                                            <div className="flex items-center gap-2 text-slate-400 font-extrabold tracking-[0.2em] text-[10px] uppercase">
                                                Deductions & Notes
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                {form.watch(\`rows.\${index}.commission\`) > 0 ? (
                                                    <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                                                        <button
                                                            type="button"
                                                            onClick={(_e) => form.setValue(\`rows.\${index}.arrival_type\`, 'commission')}
                                                            className={cn(
                                                                "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                                                form.watch(\`rows.\${index}.arrival_type\`) === 'commission' || form.watch(\`rows.\${index}.arrival_type\`) === 'direct'
                                                                    ? "bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200"
                                                                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                                            )}
                                                        >
                                                            Farmer Comm
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(_e) => form.setValue(\`rows.\${index}.arrival_type\`, 'commission_supplier')}
                                                            className={cn(
                                                                "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                                                form.watch(\`rows.\${index}.arrival_type\`) === 'commission_supplier'
                                                                    ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200"
                                                                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                                            )}
                                                        >
                                                            Supplier Comm
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl shadow-sm">
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Direct Purchase</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                            {/* Less Units & Weight Loss */}
                                            <div className="lg:col-span-8 flex flex-col md:flex-row gap-6">
                                                <div className="flex-1 space-y-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={\`rows.\${index}.less_percent\`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                                                                    Weight Loss %
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <Input
                                                                            type="number"
                                                                            {...field}
                                                                            onChange={(e) => {
                                                                                const p = Number(e.target.value) || 0;
                                                                                field.onChange(p);
                                                                                const qty = form.getValues(\`rows.\${index}.qty\`) || 0;
                                                                                form.setValue(\`rows.\${index}.less_units\`, Number((qty * p / 100).toFixed(2)));
                                                                            }}
                                                                            className="h-12 pl-12 pr-12 bg-white border-slate-200 text-slate-700 font-black text-center rounded-xl focus:ring-blue-500/20 shadow-sm"
                                                                        />
                                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                                                    </div>
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                <div className="flex-1 space-y-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={\`rows.\${index}.less_units\`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                                                                    Less Units
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <Input
                                                                            type="number"
                                                                            {...field}
                                                                            onChange={(e) => {
                                                                                const u = Number(e.target.value) || 0;
                                                                                field.onChange(u);
                                                                                const qty = form.getValues(\`rows.\${index}.qty\`) || 0;
                                                                                if (qty > 0) {
                                                                                    form.setValue(\`rows.\${index}.less_percent\`, Number((u / qty * 100).toFixed(2)));
                                                                                }
                                                                            }}
                                                                            className="h-12 pl-12 pr-12 bg-white border-red-200 text-red-600 font-black text-center rounded-xl focus:ring-red-500/20 shadow-sm"
                                                                        />
                                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-red-400 font-bold">-</span>
                                                                    </div>
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </div>

                                            {/* Notes */}
                                            <div className="lg:col-span-4">
                                                <FormField
                                                    control={form.control}
                                                    name={\`rows.\${index}.notes\`}
                                                    render={({ field }) => (
                                                        <FormItem className="h-full flex flex-col justify-end">
                                                            <FormLabel className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                                                                Internal Notes
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    {...field}
                                                                    placeholder="Lot quality, grading..."
                                                                    value={field.value || ''}
                                                                    className="h-12 bg-white border-slate-200 text-xs font-bold rounded-xl shadow-sm focus:ring-blue-500/20"
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </div>`;
    content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
    fs.writeFileSync(file, content, 'utf8');
    console.log("File updated successfully.");
} else {
    console.error("Could not find block markers.");
}
