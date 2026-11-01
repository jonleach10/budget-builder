"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { IconButton, OutlineButton } from "@/components/ui/action-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { glassField } from "@/components/ui/native-select";
import { FieldError, Notice, type NoticeMessage } from "@/components/ui/notice";
import { useServerAction } from "@/hooks/use-server-action";
import type { Direction } from "@/lib/ordering";
import {
  addCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
} from "./actions";
import type { CategoryRow } from "./categories";

const SUBTITLE = "Categories are shared by the US and Germany budgets.";

/** Fixed, because stored USD amounts are locked at import. */
const BASE_CURRENCY = "USD";

type Renaming = { id: string; text: string; error: string | null };

type CategoryActions = {
  busy: boolean;
  renaming: Renaming | null;
  move: (id: string, direction: Direction) => void;
  remove: (id: string) => void;
  startRename: (category: CategoryRow) => void;
  changeRename: (text: string) => void;
  cancelRename: () => void;
  saveRename: () => void;
};

type ListProps = {
  categories: readonly CategoryRow[];
  actions: CategoryActions;
};

function AddCategoryForm({ className }: { className: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useServerAction();
  const id = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    run(
      () => addCategoryAction(name),
      (result) => {
        if (result.ok) setName("");
        else setError(result.message);
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="flex-1 space-y-1.5 md:max-w-[320px]">
        <Label htmlFor={id} className="text-caption text-moon-mist">
          New Category
        </Label>
        <Input
          id={id}
          className={glassField}
          placeholder="Pets"
          autoComplete="off"
          value={name}
          aria-invalid={error !== null}
          aria-describedby={`${id}-error`}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button type="submit" className="h-11 md:h-9" disabled={pending}>
        {pending ? "Adding..." : "Add Category"}
      </Button>
      <div className="basis-full">
        <FieldError id={`${id}-error`} message={error} />
      </div>
    </form>
  );
}

function RenameField({
  category,
  formId,
  actions,
}: {
  category: CategoryRow;
  formId: string;
  actions: CategoryActions;
}) {
  const { renaming, changeRename, cancelRename, saveRename } = actions;
  if (renaming === null) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveRename();
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-1.5">
      <Input
        autoFocus
        className={glassField}
        aria-label={`New name for ${category.name}`}
        autoComplete="off"
        value={renaming.text}
        aria-invalid={renaming.error !== null}
        aria-describedby={`${formId}-error`}
        onChange={(event) => changeRename(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancelRename();
        }}
      />
      <FieldError id={`${formId}-error`} message={renaming.error} />
    </form>
  );
}

function RenameButtons({
  formId,
  actions,
}: {
  formId: string;
  actions: CategoryActions;
}) {
  return (
    <>
      <OutlineButton onClick={actions.cancelRename}>Cancel</OutlineButton>
      <Button
        type="submit"
        form={formId}
        variant="ghost"
        className="h-11 bg-frost-wash text-white shadow-hairline md:h-9"
        disabled={actions.busy}>
        {actions.busy ? "Saving..." : "Save"}
      </Button>
    </>
  );
}

function MoveButtons({
  category,
  isFirst,
  isLast,
  actions,
}: {
  category: CategoryRow;
  isFirst: boolean;
  isLast: boolean;
  actions: CategoryActions;
}) {
  return (
    <>
      <IconButton
        label={`Move ${category.name} up`}
        icon={ArrowUp}
        disabled={isFirst || actions.busy}
        onClick={() => actions.move(category.id, "up")}
      />
      <IconButton
        label={`Move ${category.name} down`}
        icon={ArrowDown}
        disabled={isLast || actions.busy}
        onClick={() => actions.move(category.id, "down")}
      />
    </>
  );
}

function DeleteButton({
  category,
  actions,
}: {
  category: CategoryRow;
  actions: CategoryActions;
}) {
  return (
    <IconButton
      label={`Delete ${category.name}`}
      icon={Trash2}
      disabled={actions.busy}
      onClick={() => actions.remove(category.id)}
    />
  );
}

function CategoryTable({ categories, actions }: ListProps) {
  const formId = "rename-category";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-body-sm">
        <caption className="sr-only">Categories</caption>
        <thead className="bg-background text-left text-caption text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2.5 pr-2 pl-6 font-medium">
              Name
            </th>
            <th
              scope="col"
              className="w-[248px] py-2.5 pr-6 pl-2 text-right font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category, index) => {
            const isRenaming = actions.renaming?.id === category.id;

            return (
              <tr
                key={category.id}
                className="border-b border-border last:border-b-0">
                <td className="py-1.5 pr-2 pl-6">
                  {isRenaming ? (
                    <RenameField
                      category={category}
                      formId={formId}
                      actions={actions}
                    />
                  ) : (
                    category.name
                  )}
                </td>
                <td className="py-1.5 pr-6 pl-2 align-top">
                  <div className="flex items-center justify-end gap-0.5">
                    {isRenaming ? (
                      <RenameButtons formId={formId} actions={actions} />
                    ) : (
                      <>
                        <MoveButtons
                          category={category}
                          isFirst={index === 0}
                          isLast={index === categories.length - 1}
                          actions={actions}
                        />
                        <OutlineButton
                          onClick={() => actions.startRename(category)}>
                          Rename
                        </OutlineButton>
                        <DeleteButton category={category} actions={actions} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CategoryCards({ categories, actions }: ListProps) {
  const formId = "rename-category-phone";

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border text-body-sm">
        {categories.map((category, index) => (
          <li key={category.id}>
            {actions.renaming?.id === category.id ? (
              <div className="flex flex-col gap-2 px-4 py-3">
                <RenameField
                  category={category}
                  formId={formId}
                  actions={actions}
                />
                <div className="flex justify-end gap-2">
                  <RenameButtons formId={formId} actions={actions} />
                </div>
              </div>
            ) : (
              <div className="flex min-h-14 items-center justify-between gap-3 py-1 pr-2 pl-4">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {category.name}
                </span>
                <div className="flex shrink-0">
                  <MoveButtons
                    category={category}
                    isFirst={index === 0}
                    isLast={index === categories.length - 1}
                    actions={actions}
                  />
                  <IconButton
                    label={`Rename ${category.name}`}
                    icon={Pencil}
                    onClick={() => actions.startRename(category)}
                  />
                  <DeleteButton category={category} actions={actions} />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ListOrEmpty({
  categories,
  children,
}: {
  categories: readonly CategoryRow[];
  children: ReactNode;
}) {
  return categories.length > 0 ? (
    children
  ) : (
    <p className="px-6 pb-5 text-body-sm text-muted-foreground max-md:px-0 max-md:pb-0">
      No categories yet.
    </p>
  );
}

function BaseCurrencyCard() {
  return (
    <Card className="flex items-center justify-between gap-3 p-4 max-md:order-first md:p-6">
      <div className="space-y-0.5">
        <h2 className="text-body font-medium text-ice-highlight">
          Base Currency
        </h2>
        <p className="text-caption text-muted-foreground">
          Combined views and stored conversions use this currency.
        </p>
      </div>
      <Badge>{BASE_CURRENCY}</Badge>
    </Card>
  );
}

export function SettingsScreen({
  categories,
}: {
  categories: readonly CategoryRow[] | null;
}) {
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const { pending, run } = useServerAction();

  if (categories === null) {
    return (
      <PageFrame title="Settings" subtitle={SUBTITLE}>
        <Notice
          message={{
            tone: "error",
            text: "The categories can't be loaded. Reload the page to try again.",
          }}
        />
        <BaseCurrencyCard />
      </PageFrame>
    );
  }

  const actions: CategoryActions = {
    busy: pending,
    renaming,
    move(id, direction) {
      setNotice(null);
      run(
        () => moveCategoryAction(id, direction),
        (result) => {
          if (!result.ok) setNotice({ tone: "error", text: result.message });
        },
      );
    },
    remove(id) {
      setNotice(null);
      run(
        () => deleteCategoryAction(id),
        (result) => {
          setNotice(
            result.ok
              ? { tone: "done", text: result.notice ?? "" }
              : { tone: "error", text: result.message },
          );
        },
      );
    },
    startRename({ id, name }) {
      setNotice(null);
      setRenaming({ id, text: name, error: null });
    },
    changeRename(text) {
      setRenaming((current) => current && { ...current, text });
    },
    cancelRename() {
      setRenaming(null);
    },
    saveRename() {
      if (renaming === null) return;
      const { id, text } = renaming;

      run(
        () => renameCategoryAction(id, text),
        (result) => {
          if (result.ok) setRenaming(null);
          else {
            setRenaming(
              (current) => current && { ...current, error: result.message },
            );
          }
        },
      );
    },
  };

  return (
    <PageFrame title="Settings" subtitle={SUBTITLE}>
      <Notice message={notice} />

      <section
        aria-label="Categories"
        className="hidden overflow-hidden rounded-2xl bg-card shadow-glass md:block">
        <h2 className="px-6 py-5 text-body font-medium text-ice-highlight">
          Categories
        </h2>
        <ListOrEmpty categories={categories}>
          <CategoryTable categories={categories} actions={actions} />
        </ListOrEmpty>
        <AddCategoryForm className="flex flex-wrap items-end gap-x-3 gap-y-1.5 border-t border-border px-6 py-5" />
      </section>

      <section
        aria-label="Categories"
        className="flex flex-col gap-3 md:hidden">
        <h2 className="text-body font-medium text-ice-highlight">Categories</h2>
        <AddCategoryForm className="flex flex-col gap-3" />
        <ListOrEmpty categories={categories}>
          <CategoryCards categories={categories} actions={actions} />
        </ListOrEmpty>
      </section>

      <BaseCurrencyCard />
    </PageFrame>
  );
}
