import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { 
  Plus, 
  Search, 
  Pencil,
  Eye,
  Trash2
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./ui/dialog";
import { Label } from "./ui/label";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./ui/table";
import { Class } from "@shared/schema";

export function AdminClassManagement() {
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewClass, setViewClass] = useState<Class | null>(null);
  
  const [subjectName, setSubjectName] = useState("");
  const [courseNumber, setCourseNumber] = useState("");
  const [sectionNumber, setSectionNumber] = useState("");

  const { data: classes = [], isLoading } = useQuery<Class[]>({
    queryKey: ["/api/admin/classes"],
  });

  const createClassMutation = useMutation({
    mutationFn: async (data: { subjectName: string; courseNumber: string; sectionNumber: string }) => {
      const res = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || error.error || "Failed to create class");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] });
      setCreateOpen(false);
      setSubjectName("");
      setCourseNumber("");
      setSectionNumber("");
      toast({
        title: "Success",
        description: "Class created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) return;
    createClassMutation.mutate({ subjectName, courseNumber, sectionNumber });
  };

  const filteredClasses = classes.filter(c => 
    c.subjectName?.toLowerCase().includes(search.toLowerCase()) || 
    c.courseNumber?.toLowerCase().includes(search.toLowerCase()) ||
    c.classCode?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1">Class Management</h2>
          <p className="text-muted-foreground">Manage all university classes and track their status.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search classes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full"
            />
          </div>
          
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Class
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Create New Class</DialogTitle>
                  <DialogDescription>
                    Add a new class to the system. You can assign a professor later.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="subjectName">Subject / Course Name *</Label>
                    <Input
                      id="subjectName"
                      placeholder="e.g. Introduction to Computer Science"
                      value={subjectName}
                      onChange={(e) => setSubjectName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="courseNumber">Course Number</Label>
                      <Input
                        id="courseNumber"
                        placeholder="e.g. CS101"
                        value={courseNumber}
                        onChange={(e) => setCourseNumber(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="sectionNumber">Section Number</Label>
                      <Input
                        id="sectionNumber"
                        placeholder="e.g. 01"
                        value={sectionNumber}
                        onChange={(e) => setSectionNumber(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createClassMutation.isPending}>
                    {createClassMutation.isPending ? "Creating..." : "Create Class"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Class Name</TableHead>
              <TableHead>Course / Section</TableHead>
              <TableHead>Class Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Professor</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Loading classes...
                </TableCell>
              </TableRow>
            ) : filteredClasses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No classes found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredClasses.map((cls) => (
                <TableRow key={cls.id}>
                  <TableCell className="font-medium">
                    {cls.subjectName}
                  </TableCell>
                  <TableCell>
                    {cls.courseNumber && cls.sectionNumber 
                      ? `${cls.courseNumber} - ${cls.sectionNumber}` 
                      : cls.courseNumber || cls.sectionNumber || "-"}
                  </TableCell>
                  <TableCell>
                    <code className="px-2 py-1 bg-muted rounded-md font-mono text-sm">
                      {cls.classCode}
                    </code>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      cls.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {cls.status || 'active'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {cls.professorId ? (
                      <span className="text-sm">Assigned</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewClass(cls)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!viewClass} onOpenChange={(open) => !open && setViewClass(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Class Details</DialogTitle>
          </DialogHeader>
          {viewClass && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium">Subject</span>
                <span className="col-span-2 text-sm">{viewClass.subjectName}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium">Course/Section</span>
                <span className="col-span-2 text-sm">
                  {viewClass.courseNumber && viewClass.sectionNumber 
                    ? `${viewClass.courseNumber} - ${viewClass.sectionNumber}` 
                    : viewClass.courseNumber || viewClass.sectionNumber || "-"}
                </span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium">Class Code</span>
                <code className="col-span-2 px-2 py-1 bg-muted w-fit rounded-md font-mono text-sm">
                  {viewClass.classCode}
                </code>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium">Status</span>
                <span className="col-span-2 text-sm">{viewClass.status || 'active'}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium">Professor ID</span>
                <span className="col-span-2 text-sm">{viewClass.professorId || 'Unassigned'}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium">Roster Count</span>
                <span className="col-span-2 text-sm">{(viewClass.roster || []).length} students</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setViewClass(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
