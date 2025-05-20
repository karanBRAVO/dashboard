import express from "express";
import cors from "cors";
import {
    CoreV1Api,
    CustomObjectsApi,
    KubeConfig,
    Log,
} from "@kubernetes/client-node";
import yaml from "js-yaml";
import { Transform } from "stream";

export const app = express();
app.use(cors({ origin: "*" }));

const kc = new KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(CustomObjectsApi);
const k8sCoreApi = kc.makeApiClient(CoreV1Api);

const log = new Log(kc);

app.get("/api/pod/logs", async (req, res) => {
    const { namespace, pod, container } = req.query;

    const sseStream = new Transform({
        transform(chunk, encoding, callback) {
            const data = chunk.toString().trim().split("\n");
            for (const line of data) {
                res.write(`data: ${line}\n\n`);
            }
            callback();
        },
    });

    if (!namespace || !pod || !container) {
        return res
            .status(400)
            .json({ error: "Missing namespace, pod, or container" });
    }

    try {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const logStream = await log.log(namespace, pod, container, sseStream, {
            follow: true,
            pretty: true,
            timestamps: true,
        });

        req.on("close", () => {
            console.log("Client disconnected");
            logStream.abort();
            res.end();
        });
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

app.get("/api/usage", async (req, res) => {
    try {
        const nodeMetrics = await k8sApi.listClusterCustomObject({
            group: "metrics.k8s.io",
            version: "v1beta1",
            plural: "nodes",
            pretty: true,
        });

        res.status(200).json({
            message: "Kubernetes api usage data.",
            nodeMetrics: nodeMetrics,
        });
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({
            error: "Failed to fetch metric data | Install the metric server",
        });
    }
});

app.get("/api/jobs", async (req, res) => {
    try {
        const namespace = req.query.namespace || "";
        const searchTerm = req.query.search || "";
        const queueFilter = req.query.queue || "";
        const statusFilter = req.query.status || "";

        console.log("Fetching jobs with params:", {
            namespace,
            searchTerm,
            queueFilter,
            statusFilter,
        });

        let response;
        if (namespace === "" || namespace === "All") {
            response = await k8sApi.listClusterCustomObject({
                group: "batch.volcano.sh",
                version: "v1alpha1",
                plural: "jobs",
                pretty: true,
            });
        } else {
            response = await k8sApi.listNamespacedCustomObject({
                group: "batch.volcano.sh",
                version: "v1alpha1",
                namespace,
                plural: "jobs",
                pretty: true,
            });
        }

        let filteredJobs = response.items || [];

        if (searchTerm) {
            filteredJobs = filteredJobs.filter((job) =>
                job.metadata.name
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase()),
            );
        }

        // Apply queueFilter filtering
        if (queueFilter && queueFilter !== "All") {
            filteredJobs = filteredJobs.filter(
                (job) => job.spec.queue === queueFilter,
            );
        }

        if (statusFilter && statusFilter !== "All") {
            filteredJobs = filteredJobs.filter(
                (job) => job.status.state.phase === statusFilter,
            );
        }

        res.json({
            items: filteredJobs,
            totalCount: filteredJobs.length,
        });
    } catch (err) {
        console.error("Error fetching jobs:", err);
        res.status(500).json({
            error: "Failed to fetch jobs",
            details: err.message,
        });
    }
});

// Add an interface to obtain a single job
app.get("/api/jobs/:namespace/:name", async (req, res) => {
    try {
        const { namespace, name } = req.params;
        const response = await k8sApi.getNamespacedCustomObject({
            group: "batch.volcano.sh",
            version: "v1alpha1",
            namespace,
            plural: "jobs",
            name,
        });
        res.json(response);
    } catch (err) {
        console.error("Error fetching job:", err);
        res.status(500).json({
            error: "Failed to fetch job",
            details: err.message,
        });
    }
});

// Add a route to obtain YAML in server.js
app.get("/api/job/:namespace/:name/yaml", async (req, res) => {
    try {
        const { namespace, name } = req.params;
        const response = await k8sApi.getNamespacedCustomObject({
            group: "batch.volcano.sh",
            version: "v1alpha1",
            namespace,
            plural: "jobs",
            name,
        });

        const formattedYaml = yaml.dump(response, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
        });

        res.setHeader("Content-Type", "text/yaml");
        res.send(formattedYaml);
    } catch (error) {
        console.error("Error fetching job YAML:", error);
        res.status(500).json({
            error: "Failed to fetch job YAML",
            details: error.message,
        });
    }
});

// Get details of a specific Queue
app.get("/api/queues/:name", async (req, res) => {
    const name = req.params.name;
    try {
        const response = await k8sApi.getClusterCustomObject({
            group: "scheduling.volcano.sh",
            version: "v1beta1",
            plural: "queues",
            name,
        });
        res.json(response);
    } catch (error) {
        console.error("Error fetching queue details:", error);
        res.status(500).json({ error: "Failed to fetch queue details" });
    }
});

app.get("/api/queue/:name/yaml", async (req, res) => {
    const name = req.params.name;
    try {
        const response = await k8sApi.getClusterCustomObject({
            group: "scheduling.volcano.sh",
            version: "v1beta1",
            plural: "queues",
            name,
        });

        const formattedYaml = yaml.dump(response, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
        });

        // Set the content type to text/yaml and send the response
        res.setHeader("Content-Type", "text/yaml");
        res.send(formattedYaml);
    } catch (error) {
        console.error("Error fetching job YAML:", error);
        res.status(500).json({
            error: "Failed to fetch job YAML",
            details: error.message,
        });
    }
});

// Get all Volcano Queues
app.get("/api/queues", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const searchTerm = req.query.search || "";
        const stateFilter = req.query.state || "";

        console.log("Fetching queues with params:", {
            page,
            limit,
            searchTerm,
            stateFilter,
        });

        const response = await k8sApi.listClusterCustomObject({
            group: "scheduling.volcano.sh",
            version: "v1beta1",
            plural: "queues",
        });

        let filteredQueues = response.items || [];

        if (searchTerm) {
            filteredQueues = filteredQueues.filter((queue) =>
                queue.metadata.name
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase()),
            );
        }

        if (stateFilter && stateFilter !== "All") {
            filteredQueues = filteredQueues.filter(
                (pod) => pod.status.state === stateFilter,
            );
        }

        const totalCount = filteredQueues.length;
        const startIndex = (page - 1) * limit;
        const endIndex = Math.min(startIndex + limit, totalCount);
        const paginatedQueues = filteredQueues.slice(startIndex, endIndex);

        res.json({
            items: paginatedQueues,
            totalCount: totalCount,
            page: page,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit),
        });
    } catch (error) {
        console.error("Error fetching queues:", error);
        res.status(500).json({
            error: "Failed to fetch queues",
            details: error.message,
        });
    }
});

// get all ns
app.get("/api/namespaces", async (req, res) => {
    try {
        const response = await k8sCoreApi.listNamespace();

        res.json({
            items: response.items,
        });
    } catch (error) {
        console.error("Error fetching namespaces:", error);
        res.status(500).json({
            error: "Failed to fetch namespaces",
            details: error.message,
        });
    }
});

app.get("/api/pods", async (req, res) => {
    try {
        const namespace = req.query.namespace || "";
        const searchTerm = req.query.search || "";
        const statusFilter = req.query.status || "";

        console.log("Fetching pods with params:", {
            namespace,
            searchTerm,
            statusFilter,
        });

        let response;
        if (namespace === "" || namespace === "All") {
            response = await k8sCoreApi.listPodForAllNamespaces();
        } else {
            response = await k8sCoreApi.listNamespacedPod({ namespace });
        }

        let filteredPods = response.items || [];

        // Apply search filter
        if (searchTerm) {
            filteredPods = filteredPods.filter((pod) =>
                pod.metadata.name
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase()),
            );
        }

        if (statusFilter && statusFilter !== "All") {
            filteredPods = filteredPods.filter(
                (pod) => pod.status.phase === statusFilter,
            );
        }

        res.json({
            items: filteredPods,
            totalCount: filteredPods.length,
        });
    } catch (err) {
        console.error("Error fetching pods:", err);
        res.status(500).json({
            error: "Failed to fetch pods",
            details: err.message,
        });
    }
});

// Get details of a specific Pod
app.get("/api/pod/:namespace/:name/yaml", async (req, res) => {
    try {
        const { namespace, name } = req.params;
        const response = await k8sCoreApi.readNamespacedPod({
            name,
            namespace,
        });

        // Convert JSON to formatted YAML
        const formattedYaml = yaml.dump(response, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
        });

        //Set the content type to text/yaml and send the response
        res.setHeader("Content-Type", "text/yaml");
        res.send(formattedYaml);
    } catch (error) {
        console.error("Error fetching job YAML:", error);
        res.status(500).json({
            error: "Failed to fetch job YAML",
            details: error.message,
        });
    }
});

// Get all Jobs (no pagination)
app.get("/api/all-jobs", async (req, res) => {
    try {
        const response = await k8sApi.listClusterCustomObject({
            group: "batch.volcano.sh",
            version: "v1alpha1",
            plural: "jobs", // 修改这里：从 "jobs" 改为 "vcjobs"
            pretty: true,
        });

        const jobs = response.items.map((job) => ({
            ...job,
            status: {
                state: job.status?.state || getJobState(job),
                phase:
                    job.status?.phase || job.spec?.minAvailable
                        ? "Running"
                        : "Unknown",
            },
        }));

        res.json({
            items: jobs,
            totalCount: jobs.length,
        });
    } catch (err) {
        console.error("Error fetching all jobs:", err);
        res.status(500).json({ error: "Failed to fetch all jobs" });
    }
});

// Auxiliary function: determine the status based on the job status
function getJobState(job) {
    if (job.status?.state) return job.status.state;
    if (job.status === "Running") return "Running";
    if (job.status === "Completed") return "Completed";
    if (job.status === "Failed") return "Failed";
    if (job.status === "Pending") return "Running";
    return job.status || "Unknown";
}

// Get all Queues (no pagination)
app.get("/api/all-queues", async (req, res) => {
    try {
        const response = await k8sApi.listClusterCustomObject({
            group: "scheduling.volcano.sh",
            version: "v1beta1",
            plural: "queues",
        });
        res.json({
            items: response.items,
            totalCount: response.items.length,
        });
    } catch (error) {
        console.error("Error fetching all queues:", error);
        res.status(500).json({ error: "Failed to fetch all queues" });
    }
});

// Get all Pods (no pagination)
app.get("/api/all-pods", async (req, res) => {
    try {
        const response = await k8sCoreApi.listPodForAllNamespaces();
        res.json({
            items: response.items,
            totalCount: response.items.length,
        });
    } catch (error) {
        console.error("Error fetching all pods:", error);
        res.status(500).json({ error: "Failed to fetch all pods" });
    }
});

// get all heirarchical queues
app.get("/api/heirarchical-queues", async (req, res) => {
    try {
        // get all queues
        const queues = await k8sApi.listClusterCustomObject({
            group: "scheduling.volcano.sh",
            version: "v1beta1",
            plural: "queues",
        });
        // get all jobs
        const jobs = await k8sApi.listClusterCustomObject({
            group: "batch.volcano.sh",
            version: "v1alpha1",
            plural: "jobs",
            pretty: true,
        });
        // get all pods
        const pods = await k8sCoreApi.listPodForAllNamespaces();
        // stores heirarchical queues
        const h_queues = {};
        // generate heirarchical queues
        if (queues.items) {
            queues.items.forEach((queue) => {
                // current queue name
                const qname = queue.metadata.name;
                h_queues[qname] = {
                    parent: null,
                    uid: queue.metadata.uid,
                    creationTimestamp: queue.metadata.creationTimestamp,
                    state: queue.status.state,
                    weight: queue.spec.weight,
                    reclaimable: queue.spec.reclaimable,
                    jobs: [],
                };
                // check current queue parent
                if (queue.spec.parent) {
                    h_queues[qname].parent = queue.spec.parent;
                }
                // check current queue jobs
                jobs.items.forEach((job) => {
                    if (job.spec.queue === qname) {
                        const jobData = {
                            name: job.metadata.name,
                            namespace: job.metadata.namespace,
                            creationTimestamp: job.metadata.creationTimestamp,
                            uid: job.metadata.uid,
                            state: getJobState(job),
                            tasksCount: job.spec.tasks.length,
                            tasks: job.spec.tasks,
                        };
                        h_queues[qname].jobs.push(jobData);
                    }
                });
            });
        }
        // stores pods
        const podMap = {};
        // generate podMap
        pods.items?.forEach((pod) => {
            const jobName = pod.metadata.annotations?.["volcano.sh/job-name"];
            const taskName = pod.metadata.annotations?.["volcano.sh/task-spec"];

            if (!jobName || !taskName) return;

            const key = `${jobName}::${taskName}`;
            if (!podMap[key]) podMap[key] = [];
            podMap[key].push({
                name: pod.metadata.name,
                namespace: pod.metadata.namespace,
                uid: pod.metadata.uid,
                phase: pod.status?.phase,
                startTime: pod.status?.startTime,
            });
        });
        res.json({
            queues: h_queues,
            podMap,
            totalCount: Object.keys(h_queues).length,
        });
    } catch (error) {
        console.error("Error generating heirarchical data:", error);
        res.status(500).json({
            error: "Failed to generate heirarchical data.",
        });
    }
});

const verifyVolcanoSetup = async () => {
    try {
        // Verify CRD access
        await k8sApi.listClusterCustomObject({
            group: "batch.volcano.sh",
            version: "v1alpha1",
            plural: "jobs",
        });
        return true;
    } catch (error) {
        console.error("Volcano verification failed:", error);
        return false;
    }
};

// Update your server startup
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    const volcanoReady = await verifyVolcanoSetup();
    if (volcanoReady) {
        console.log(`Server running on port ${PORT} with Volcano support`);
    } else {
        console.error("Server started but Volcano support is not available");
    }
});
