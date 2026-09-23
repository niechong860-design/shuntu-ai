import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteAdminRechargePackage,
  hideAdminRechargePackage,
  listAdminRechargePackages,
  upsertAdminRechargePackage,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EyeOff, Pencil, Plus, RefreshCw, Save, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

type RechargePackage = {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  credits: number;
  features: string[];
  badgeText: string;
  isPopular: boolean;
  highlighted: boolean;
  isVisible: boolean;
  sortOrder: number;
  buttonText: string;
  purchaseUrl: string;
  createdAt: string;
  updatedAt: string;
};

type EditState = {
  id?: string;
  title: string;
  subtitle: string;
  price: string;
  credits: string;
  featuresText: string;
  badgeText: string;
  isPopular: boolean;
  highlighted: boolean;
  isVisible: boolean;
  sortOrder: string;
  buttonText: string;
  purchaseUrl: string;
};

const emptyPackage = (): EditState => ({
  title: "",
  subtitle: "",
  price: "",
  credits: "0",
  featuresText: "",
  badgeText: "",
  isPopular: false,
  highlighted: false,
  isVisible: true,
  sortOrder: "0",
  buttonText: "立即购买",
  purchaseUrl: "",
});

const toEditState = (pkg: RechargePackage): EditState => ({
  id: pkg.id,
  title: pkg.title,
  subtitle: pkg.subtitle ?? "",
  price: pkg.price,
  credits: String(pkg.credits ?? 0),
  featuresText: (pkg.features ?? []).join("\n"),
  badgeText: pkg.badgeText ?? "",
  isPopular: pkg.isPopular,
  highlighted: pkg.highlighted,
  isVisible: pkg.isVisible,
  sortOrder: String(pkg.sortOrder ?? 0),
  buttonText: pkg.buttonText || "立即购买",
  purchaseUrl: pkg.purchaseUrl ?? "",
});

function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isRechargePackagesTableMissing(error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("public.recharge_packages") ||
    message.includes("recharge_packages") && message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

export function RechargePackagesPanel() {
  const listFn = useServerFn(listAdminRechargePackages);
  const saveFn = useServerFn(upsertAdminRechargePackage);
  const hideFn = useServerFn(hideAdminRechargePackage);
  const deleteFn = useServerFn(deleteAdminRechargePackage);
  const [packages, setPackages] = useState<RechargePackage[]>([]);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setPackages(((await listFn({})) ?? []) as RechargePackage[]);
      setSchemaMissing(false);
    } catch (e: any) {
      if (isRechargePackagesTableMissing(e)) {
        setSchemaMissing(true);
        setPackages([]);
      } else {
        toast.error(e.message ?? "充值套餐加载失败");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    const price = editing.price.trim();
    const credits = Number(editing.credits);
    const sortOrder = Number(editing.sortOrder);
    const purchaseUrl = editing.purchaseUrl.trim();

    if (!title) return toast.error("套餐名称不能为空");
    if (!price) return toast.error("价格不能为空");
    if (!Number.isInteger(credits) || credits < 0) return toast.error("积分数量必须是非负整数");
    if (!Number.isInteger(sortOrder)) return toast.error("排序必须是整数");
    if (purchaseUrl && !/^https?:\/\//i.test(purchaseUrl)) {
      return toast.error("购买链接必须以 http:// 或 https:// 开头");
    }

    setSaving(true);
    try {
      await saveFn({
        data: {
          id: editing.id,
          title,
          subtitle: editing.subtitle.trim() || null,
          price,
          credits,
          features: parseLines(editing.featuresText),
          badgeText: editing.badgeText.trim() || null,
          isPopular: editing.isPopular,
          highlighted: editing.highlighted,
          isVisible: editing.isVisible,
          sortOrder,
          buttonText: editing.buttonText.trim() || "立即购买",
          purchaseUrl,
        },
      });
      toast.success("充值套餐已保存");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const hide = async (pkg: RechargePackage) => {
    if (!confirm(`确认隐藏套餐"${pkg.title}"吗？隐藏后普通用户将看不到该套餐。`)) return;
    try {
      await hideFn({ data: { id: pkg.id } });
      toast.success("套餐已隐藏");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "隐藏失败");
    }
  };

  const remove = async (pkg: RechargePackage) => {
    if (!confirm(`确认永久删除套餐“${pkg.title}”吗？此操作只删除套餐展示配置，不影响卡密和用户积分。`)) return;
    try {
      await deleteFn({ data: { id: pkg.id } });
      toast.success("套餐已删除");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "删除失败");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          共 {packages.length} 个套餐，显示 {packages.filter((pkg) => pkg.isVisible).length} 个
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
          </Button>
          <Button
            size="sm"
            className="bg-gradient-aurora text-primary-foreground"
            disabled={schemaMissing}
            onClick={() => setEditing(emptyPackage())}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />新增套餐
          </Button>
        </div>
      </div>

      {schemaMissing && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          充值套餐表尚未创建，请先应用数据库迁移后再配置套餐。
        </div>
      )}

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>排序</TableHead>
              <TableHead>套餐</TableHead>
              <TableHead>价格</TableHead>
              <TableHead className="text-right">积分</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>显示</TableHead>
              <TableHead>购买链接</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((pkg) => (
              <TableRow key={pkg.id} className={pkg.isVisible ? undefined : "opacity-60"}>
                <TableCell className="font-mono text-xs">{pkg.sortOrder}</TableCell>
                <TableCell>
                  <div className="font-medium">{pkg.title}</div>
                  <div className="max-w-[260px] truncate text-xs text-muted-foreground">{pkg.subtitle || "-"}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{pkg.price}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{pkg.credits.toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {pkg.isPopular && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">热门</span>}
                    {pkg.highlighted && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">高亮</span>}
                    {pkg.badgeText && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{pkg.badgeText}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={pkg.isVisible ? "text-xs text-emerald-400" : "text-xs text-muted-foreground"}>
                    {pkg.isVisible ? "显示" : "隐藏"}
                  </span>
                </TableCell>
                <TableCell className="max-w-[220px] truncate font-mono text-[11px] text-muted-foreground">
                  {pkg.purchaseUrl || "-"}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(toEditState(pkg))}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-amber-400 hover:bg-amber-500/10 hover:text-amber-400"
                    disabled={!pkg.isVisible}
                    onClick={() => hide(pkg)}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => remove(pkg)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {packages.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                  暂无充值套餐
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-3xl border-border/70 bg-card/90 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              {editing?.id ? "编辑充值套餐" : "新增充值套餐"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid max-h-[72vh] gap-3 overflow-auto pr-1 sm:grid-cols-2">
              <Field label="套餐名称">
                <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </Field>
              <Field label="副标题/说明">
                <Input value={editing.subtitle} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
              </Field>
              <Field label="价格">
                <Input value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} placeholder="例如 69.9" />
              </Field>
              <Field label="积分数量">
                <Input type="number" value={editing.credits} onChange={(e) => setEditing({ ...editing, credits: e.target.value })} />
              </Field>
              <Field label="标签文案">
                <Input value={editing.badgeText} onChange={(e) => setEditing({ ...editing, badgeText: e.target.value })} placeholder="例如 最受欢迎" />
              </Field>
              <Field label="按钮文案">
                <Input value={editing.buttonText} onChange={(e) => setEditing({ ...editing, buttonText: e.target.value })} />
              </Field>
              <Field label="排序">
                <Input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} />
              </Field>
              <Field label="购买链接">
                <Input value={editing.purchaseUrl} onChange={(e) => setEditing({ ...editing, purchaseUrl: e.target.value })} placeholder="https://..." />
              </Field>
              <div className="grid gap-3 rounded-lg border border-border/60 bg-white/[0.03] p-3 sm:col-span-2 sm:grid-cols-3">
                <ToggleRow label="最受欢迎" checked={editing.isPopular} onCheckedChange={(v) => setEditing({ ...editing, isPopular: v })} />
                <ToggleRow label="高亮" checked={editing.highlighted} onCheckedChange={(v) => setEditing({ ...editing, highlighted: v })} />
                <ToggleRow label="显示" checked={editing.isVisible} onCheckedChange={(v) => setEditing({ ...editing, isVisible: v })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] text-muted-foreground">卖点列表（一行一个）</label>
                <Textarea
                  value={editing.featuresText}
                  rows={6}
                  onChange={(e) => setEditing({ ...editing, featuresText: e.target.value })}
                  placeholder={"1,000 积分\n基础图像模型\n标准排队速度"}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
                <Button onClick={save} disabled={saving}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {saving ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

