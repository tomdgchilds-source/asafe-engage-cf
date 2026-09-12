/**
 * Projects → Documents tab (Phase 3D Task PD6).
 *
 * Two blocks: the register of issued documents (reference, revision, date,
 * issuer, download, "Issue new revision") and the drafts the project can
 * render right now (preview with the DRAFT watermark, or issue). Issuing
 * always goes through a confirm dialog because an issued revision is
 * permanent: it allocates or steps an ASU reference and stores the PDF.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileText, Loader2, Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  formatIssuedOn,
  issueConfirmation,
  issueRequestBody,
  nextRevisionLabel,
  renderableForIssue,
  sortIssuedNewestFirst,
  type DocumentIssue,
  type DocumentRegisterResponse,
  type RenderableDocument,
} from "./documentRegister";

export function DocumentsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerKey = `/api/projects/${projectId}/documents`;

  const { data, isLoading, isError } = useQuery<DocumentRegisterResponse>({
    queryKey: [registerKey],
  });

  const issued = useMemo(() => sortIssuedNewestFirst(data?.issued ?? []), [data]);
  const renderable = data?.renderable ?? [];

  const [pending, setPending] = useState<RenderableDocument | null>(null);

  const issueMutation = useMutation({
    mutationFn: async (doc: RenderableDocument) => {
      const res = await apiRequest(doc.issueUrl, "POST", issueRequestBody(doc));
      return (await res.json()) as { issue: DocumentIssue };
    },
    onSuccess: ({ issue }) => {
      queryClient.invalidateQueries({ queryKey: [registerKey] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/approvals`] });
      toast({
        title: `Issued ${issue.label}`,
        description: `${issue.ref} Rev ${issue.revision}`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not issue document",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const confirm = pending ? issueConfirmation(pending) : null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Couldn't load the document register. Refresh the page to try again.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="documents-tab">
      {/* Issued register */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Issued documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {issued.length === 0 ? (
            <div className="p-8 text-center" data-testid="documents-empty">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No documents issued on this project yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Issue a draft below to allocate a reference and store the PDF.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="documents-issued-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="w-16">Rev</TableHead>
                    <TableHead>Issued on</TableHead>
                    <TableHead>Issued by</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issued.map((row) => {
                    const target = renderableForIssue(row, renderable);
                    return (
                      <TableRow key={row.id} data-testid={`document-issue-${row.id}`}>
                        <TableCell className="font-medium">
                          {row.label}
                          {target && (
                            <div className="text-xs text-muted-foreground font-normal">{target.subjectLabel}</div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.ref}</TableCell>
                        <TableCell>{row.revision}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatIssuedOn(row.issuedAt)}</TableCell>
                        <TableCell>{row.issuedBy?.name || "—"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {row.downloadUrl ? (
                            <Button asChild variant="ghost" size="sm" data-testid={`document-download-${row.id}`}>
                              <a href={row.downloadUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3.5 w-3.5 mr-1" />
                                Download
                              </a>
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" disabled>
                              <Download className="h-3.5 w-3.5 mr-1" />
                              Download
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-2"
                            disabled={!target || issueMutation.isPending}
                            onClick={() => target && setPending(target)}
                            data-testid={`document-reissue-${row.id}`}
                          >
                            <Stamp className="h-3.5 w-3.5 mr-1" />
                            Issue new revision
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drafts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Drafts available</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {renderable.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground" data-testid="documents-drafts-empty">
              Nothing to render yet. Documents appear here once the project has an order, a site survey, a
              layout drawing or an installation.
            </div>
          ) : (
            <ul className="divide-y" data-testid="documents-drafts">
              {renderable.map((doc) => (
                <li key={doc.key} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`document-draft-${doc.key}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {doc.label}
                      {doc.lastIssued ? (
                        <Badge variant="secondary" className="font-normal">
                          Last issued Rev {doc.lastIssued.revision}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal">
                          Never issued
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{doc.subjectLabel}</div>
                  </div>
                  <div className="flex-shrink-0 whitespace-nowrap">
                    <Button asChild variant="ghost" size="sm">
                      <a href={doc.draftUrl} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Preview draft
                      </a>
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="ml-2"
                      disabled={issueMutation.isPending}
                      onClick={() => setPending(doc)}
                      data-testid={`document-issue-${doc.key}`}
                    >
                      {issueMutation.isPending && issueMutation.variables?.key === doc.key ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Stamp className="h-3.5 w-3.5 mr-1" />
                      )}
                      Issue Rev {nextRevisionLabel(doc.lastIssued)}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirm && pending && (
        <ConfirmationDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          title={confirm.title}
          description={confirm.description}
          confirmText={confirm.confirmText}
          onConfirm={() => {
            const doc = pending;
            setPending(null);
            issueMutation.mutate(doc);
          }}
        />
      )}
    </div>
  );
}

export default DocumentsTab;
