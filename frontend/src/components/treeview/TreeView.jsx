import { useCallback, useState } from "react";
import {
    ReactFlow,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider,
    Panel,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { initialNodes, initialEdges } from "./nodes.js";
import { nanoid } from "nanoid";
import { QueueNode, JobNode, TaskNode, PodNode } from "./TreeNodes.jsx";

import "@xyflow/react/dist/style.css";
import axios from "axios";

const elk = new ELK();

const useLayoutedElements = () => {
    const { getNodes, setNodes, getEdges, fitView } = useReactFlow();
    const defaultOptions = {
        "elk.algorithm": "layered",
        "elk.layered.spacing.nodeNodeBetweenLayers": 100,
        "elk.spacing.nodeNode": 80,
    };

    const getLayoutedElements = useCallback((options) => {
        const layoutOptions = { ...defaultOptions, ...options };
        const graph = {
            id: "root",
            layoutOptions: layoutOptions,
            children: getNodes().map((node) => ({
                ...node,
                width: node.measured.width,
                height: node.measured.height,
            })),
            edges: getEdges(),
        };

        elk.layout(graph).then(({ children }) => {
            // By mutating the children in-place we saves ourselves from creating a
            // needless copy of the nodes array.
            children.forEach((node) => {
                node.position = { x: node.x, y: node.y };
            });

            setNodes(children);
            fitView();
        });
    }, []);

    return { getLayoutedElements };
};

// define custom nodes
const nodeTypes = {
    queue: QueueNode,
    job: JobNode,
    task: TaskNode,
    pod: PodNode,
};

const TreeView = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const { getLayoutedElements } = useLayoutedElements();

    const [selectedNode, setSelectedNode] = useState(null);

    const fetchHQueues = useCallback(async () => {
        try {
            // fetch queues from the API
            const response = await axios.get(`/api/heirarchical-queues`);
            if (response.status !== 200) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = response.data;
            if (data.totalCount > 0) {
                const queues = data.queues;
                const podMap = data.podMap;
                const nodes = [];
                const edges = [];
                const nodeIdMap = {}; // temporary map to store node ids
                Object.keys(queues).forEach((qname) => {
                    const {
                        uid: quid,
                        creationTimestamp: qct,
                        state: qstate,
                        weight: qwt,
                        reclaimable: qrec,
                        jobs,
                    } = queues[qname];

                    // Create a node for each queue
                    const qnode = {
                        id: nanoid(),
                        type: "queue",
                        data: {
                            label: qname,
                            selected: false,
                            type: "queue",
                            uid: quid,
                            creationTimestamp: qct,
                            state: qstate,
                            weight: qwt,
                            reclaimable: qrec,
                        },
                        position: { x: 0, y: 0 },
                    };
                    nodeIdMap[qname] = qnode.id;
                    nodes.push(qnode);

                    // Add jobs as child nodes
                    jobs.forEach((job) => {
                        const {
                            name: jobName,
                            namespace: jobNamespace,
                            creationTimestamp: jobCT,
                            uid: jobUID,
                            state: jobState,
                            tasksCount: jobTC,
                            tasks: jobTasks,
                        } = job;
                        const jobNode = {
                            id: nanoid(),
                            type: "job",
                            data: {
                                label: jobName,
                                selected: false,
                                type: "job",
                                namespace: jobNamespace,
                                creationTimestamp: jobCT,
                                uid: jobUID,
                                state: jobState,
                                tasksCount: jobTC,
                            },
                            position: { x: 0, y: 0 },
                        };
                        nodeIdMap[jobName] = jobNode.id;
                        nodes.push(jobNode);

                        // Add task nodes
                        jobTasks.forEach((task) => {
                            const taskNode = {
                                id: nanoid(),
                                type: "task",
                                data: {
                                    label: task.name,
                                    selected: false,
                                    type: "task",
                                    ...task,
                                },
                                position: { x: 0, y: 0 },
                            };
                            nodeIdMap[`${jobName}::${task.name}`] = taskNode.id;
                            nodes.push(taskNode);
                        });
                    });
                });
                Object.keys(podMap).forEach((job_task) => {
                    const pods = podMap[job_task];
                    pods.forEach((pod) => {
                        const podNode = {
                            id: nanoid(),
                            type: "pod",
                            data: {
                                label: pod.name,
                                selected: false,
                                type: "pod",
                                ...pod,
                            },
                            position: { x: 0, y: 0 },
                        };
                        const edge = {
                            id: nanoid(),
                            source: nodeIdMap[job_task],
                            target: podNode.id,
                            animated: true,
                        };
                        nodes.push(podNode);
                        edges.push(edge);
                    });
                });

                // Create edges
                Object.keys(queues).forEach((qname) => {
                    const { parent, jobs } = queues[qname];
                    // edge between queue and parent(queue)
                    if (parent !== null) {
                        const edge = {
                            id: nanoid(),
                            source: nodeIdMap[parent],
                            target: nodeIdMap[qname],
                            animated: true,
                        };
                        edges.push(edge);
                    }

                    // edges between jobs and queues
                    jobs.forEach((job) => {
                        const edge = {
                            id: nanoid(),
                            source: nodeIdMap[qname],
                            target: nodeIdMap[job.name],
                            animated: true,
                        };
                        edges.push(edge);

                        // edges between jobs and tasks
                        job.tasks.forEach((task) => {
                            const edge = {
                                id: nanoid(),
                                source: nodeIdMap[job.name],
                                target: nodeIdMap[`${job.name}::${task.name}`],
                                animated: true,
                            };
                            edges.push(edge);
                        });
                    });
                });
                setNodes(nodes);
                setEdges(edges);
            }
        } catch (error) {
            console.error("Error fetching queues:", error);
        }
    }, [setEdges, setNodes]);

    return (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr" }}>
            <div
                style={{
                    width: "900px",
                    height: "600px",
                    background: "#f0f0f0",
                }}
            >
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    onNodeClick={(_, node) => {
                        setSelectedNode(node);
                        const updatedNodes = nodes.map((nd) => ({
                            ...nd,
                            data: {
                                ...nd.data,
                                selected: nd.id === node.id,
                            },
                        }));
                        setNodes(updatedNodes);
                    }}
                    onPaneClick={() => {
                        setSelectedNode(null);
                        const updatedNodes = nodes.map((nd) => ({
                            ...nd,
                            data: {
                                ...nd.data,
                                selected: false,
                            },
                        }));
                        setNodes(updatedNodes);
                    }}
                    fitView={true}
                >
                    {selectedNode && (
                        <Panel position="top-right">
                            <div
                                style={{
                                    background: "#ccc",
                                    fontFamily: "monospace",
                                    padding: "10px",
                                    width: "300px",
                                    fontSize: "12px",
                                }}
                            >
                                <div>
                                    <h4>Node Info Panel</h4>
                                    <hr />
                                    <div>
                                        <strong>Name:</strong>
                                        {selectedNode.data.label}
                                    </div>
                                    {selectedNode.type === "pod" ? (
                                        <>
                                            <div>
                                                <strong>Namespace:</strong>
                                                {selectedNode.data?.namespace}
                                            </div>
                                            <div>
                                                <strong>Phase:</strong>
                                                {selectedNode.data?.phase}
                                            </div>
                                            <div>
                                                <strong>Start Time:</strong>
                                                {new Date(
                                                    selectedNode.data?.startTime,
                                                ).toLocaleString()}
                                            </div>
                                            <div>
                                                <strong>UID:</strong>
                                                {selectedNode.data?.uid}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {selectedNode.type === "task" ? (
                                                <>
                                                    <div>
                                                        <strong>
                                                            Min Available:
                                                        </strong>
                                                        {
                                                            selectedNode.data
                                                                ?.minAvailable
                                                        }
                                                    </div>
                                                    <div>
                                                        <strong>
                                                            Max Retry:
                                                        </strong>
                                                        {
                                                            selectedNode.data
                                                                ?.maxRetry
                                                        }
                                                    </div>
                                                    <div>
                                                        <strong>
                                                            Replicas:
                                                        </strong>
                                                        {
                                                            selectedNode.data
                                                                ?.replicas
                                                        }
                                                    </div>
                                                    <div>
                                                        <strong>
                                                            Containers:
                                                        </strong>
                                                        {
                                                            selectedNode.data
                                                                ?.template?.spec
                                                                ?.containers
                                                                .length
                                                        }
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div>
                                                        <strong>State:</strong>
                                                        {selectedNode.data.state
                                                            .phase
                                                            ? selectedNode.data
                                                                  .state.phase
                                                            : selectedNode.data
                                                                  .state}
                                                    </div>
                                                    {selectedNode.type ===
                                                    "queue" ? (
                                                        <div>
                                                            <strong>
                                                                Reclaimable:
                                                            </strong>
                                                            {selectedNode.data
                                                                .reclaimable
                                                                ? "Yes"
                                                                : "No"}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div>
                                                                <strong>
                                                                    Namespace:
                                                                </strong>
                                                                {
                                                                    selectedNode
                                                                        .data
                                                                        .namespace
                                                                }
                                                            </div>
                                                            <div>
                                                                <strong>
                                                                    Tasks:
                                                                </strong>
                                                                {
                                                                    selectedNode
                                                                        .data
                                                                        .tasksCount
                                                                }
                                                            </div>
                                                        </>
                                                    )}
                                                    <div>
                                                        <strong>
                                                            Creation Timestamp:
                                                        </strong>
                                                        {new Date(
                                                            selectedNode.data.creationTimestamp,
                                                        ).toLocaleString()}
                                                    </div>
                                                    <div>
                                                        <strong>UID:</strong>
                                                        {selectedNode.data.uid}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </Panel>
                    )}
                    <Controls />
                    <Background variant="dots" gap={12} size={1} />
                </ReactFlow>
            </div>
            <div
                style={{
                    padding: "10px",
                    border: "1px solid #ccc",
                    background: "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    maxWidth: "200px",
                }}
            >
                <button
                    style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid rgb(46, 51, 57)",
                        backgroundColor: "rgb(46, 51, 57)",
                        color: "#fff",
                    }}
                    onClick={fetchHQueues}
                >
                    🔄 Refresh
                </button>
                <button
                    style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid rgb(46, 51, 57)",
                        backgroundColor: "rgb(46, 51, 57)",
                        color: "#fff",
                    }}
                    onClick={() =>
                        getLayoutedElements({
                            "elk.algorithm": "layered",
                            "elk.direction": "DOWN",
                        })
                    }
                >
                    ⬇️ Vertical Layout
                </button>
            </div>
        </div>
    );
};

export default function TreeViewWrapper() {
    return (
        <ReactFlowProvider>
            <TreeView />
        </ReactFlowProvider>
    );
}
