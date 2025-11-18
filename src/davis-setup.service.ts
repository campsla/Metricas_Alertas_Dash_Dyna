import * as dotenv from 'dotenv';
dotenv.config();

import { Injectable, HttpException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class DavisSetupService {
  private readonly dynatraceBaseUrl = process.env.DT_BASE_URL;

  private getHeaders() {
    return {
      Authorization: `Bearer ${process.env.DT_API_TOKEN ?? ''}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    };
  }

  private getSettingsUrl() {
    return `${this.dynatraceBaseUrl}/platform/classic/environment-api/v2/settings/objects`;
  }

  /**
   * Busca si ya existe una métrica de logs con ese metricKey.
   * Devuelve el objectId si existe, si no existe devuelve undefined.
   */
  private async findExistingLogMetric(metricKey: string) {
    const res = await axios.get(this.getSettingsUrl(), {
      headers: this.getHeaders(),
      params: {
        schemaIds: 'builtin:logmonitoring.schemaless-log-metric',
        scope: 'environment',
        pageSize: 500,
      },
    });

    const match = res.data.items?.find(
      (item: any) => item?.value?.key === metricKey,
    );

    if (match) {
      return match.objectId; // esto es el objectId que vimos cuando creamos la métrica a mano
    }

    return undefined;
  }

  /**
   * Busca si ya existe un detector Davis con ese título.
   * Devuelve el objectId si existe, si no existe devuelve undefined.
   */
  private async findExistingAnomalyDetector(title: string) {
    const res = await axios.get(this.getSettingsUrl(), {
      headers: this.getHeaders(),
      params: {
        schemaIds: 'builtin:davis.anomaly-detectors',
        scope: 'environment',
        pageSize: 500,
      },
    });

    const match = res.data.items?.find(
      (item: any) => item?.value?.title === title,
    );

    if (match) {
      return match.objectId;
    }

    return undefined;
  }

  /**
   * Crea la métrica de log si no existe todavía.
   * Devuelve siempre el objectId final (existente o recién creado).
   */
  private async ensureLogMetric(metricKey: string, successLogFragment: string) {
    // 1. verificar si existe
    const existingId = await this.findExistingLogMetric(metricKey);
    if (existingId) {
      console.warn(`⚠ Métrica ${metricKey} ya existía (${existingId}), no la creo de nuevo.`);
      return existingId;
    }

    // 2. si no existe, la creo
    const metricBody = [
      {
        schemaId: 'builtin:logmonitoring.schemaless-log-metric',
        scope: 'environment',
        value: {
          enabled: true,
          key: metricKey,
          measure: 'OCCURRENCE',
          query: `matchesPhrase(content, "${successLogFragment}")`,
          dimensions: [],
        },
      },
    ];

    console.log(
      '📤 Creando métrica nueva con body:',
      JSON.stringify(metricBody, null, 2),
    );

    const metricRes = await axios.post(this.getSettingsUrl(), metricBody, {
      headers: this.getHeaders(),
    });

    const newId = metricRes.data?.[0]?.objectId;
    console.log(`✅ Métrica ${metricKey} creada (${newId})`);

    return newId;
  }

  /**
   * Crea el detector Davis si no existe todavía.
   * Devuelve siempre el objectId final (existente o recién creado).
   */
  private async ensureAnomalyDetector(flowName: string, metricKey: string) {
    const title = `Heartbeat ${flowName} - Sin actividad`;

    // 1. verificar si existe
    const existingId = await this.findExistingAnomalyDetector(title);
    if (existingId) {
      console.warn(
        `⚠ Detector Davis "${title}" ya existía (${existingId}), no lo creo de nuevo.`,
      );
      return existingId;
    }

    // 2. si no existe, lo creo
    const anomalyBody = [
      {
        schemaId: 'builtin:davis.anomaly-detectors',
        scope: 'environment',
        value: {
          enabled: true,
          title: title,
          description: `Detecta ausencia total de logs exitosos de ${flowName} (métrica ${metricKey}).`,
          source: 'Davis Anomaly Detection',
          executionSettings: {},
          analyzer: {
            name: 'dt.statistics.ui.anomaly_detection.StaticThresholdAnomalyDetectionAnalyzer',
            input: [
              {
                key: 'query',
                value: `timeseries { ok_count = sum(${metricKey}) }, interval: 1m`,
              },
              {
                key: 'threshold',
                value: '1',
              },
              {
                key: 'alertCondition',
                value: 'BELOW',
              },
              {
                key: 'alertOnMissingData',
                value: 'true',
              },
              {
                key: 'violatingSamples',
                value: '3',
              },
              {
                key: 'slidingWindow',
                value: '3',
              },
              {
                key: 'dealertingSamples',
                value: '1',
              },
            ],
          },
          eventTemplate: {
            properties: [
              {
                key: 'event.type',
                value: 'CUSTOM_ALERT',
              },
              {
                key: 'event.name',
                value: `⚠ ${flowName} sin actividad en los últimos minutos`,
              },
              {
                key: 'event.description',
                value: `No se detectaron logs de ${flowName} exitoso en los últimos 3 minutos (métrica ${metricKey} = 0).`,
              },
            ],
          },
        },
      },
    ];

    console.log(
      '📤 Creando anomaly detector con body:',
      JSON.stringify(anomalyBody, null, 2),
    );

    const anomalyRes = await axios.post(this.getSettingsUrl(), anomalyBody, {
      headers: this.getHeaders(),
    });

    const newId = anomalyRes.data?.[0]?.objectId;
    console.log(`✅ Detector Davis "${title}" creado (${newId})`);

    return newId;
  }

  /**
   * Punto de entrada público que usa el controller.
   * Idempotente:
   * - si la métrica ya está → warning + devuelve esa métrica
   * - si el anomaly ya está → warning + devuelve ese anomaly
   */
  async createLogMetricAndAnomaly(
    flowName: string,
    successLogFragment: string,
  ) {
    try {
      console.log('➡ Base URL:', this.dynatraceBaseUrl);
      console.log('➡ Settings URL:', this.getSettingsUrl());
      console.log('➡ Headers (sin token):', {
        ...this.getHeaders(),
        Authorization: '***redacted***',
      });

      const metricKey = `log.${flowName}.ok.count`;

      // 1. me aseguro la métrica
      const metricId = await this.ensureLogMetric(
        metricKey,
        successLogFragment,
      );

      // 2. me aseguro el anomaly/detector
      const anomalyId = await this.ensureAnomalyDetector(flowName, metricKey);

      // 3. devuelvo todo
      return {
        ok: true,
        metricKey,
        metricId,
        anomalyId,
      };
    } catch (err: any) {
      console.error(
        '❌ Dynatrace error (full):',
        err?.response?.data || err.message,
      );
      throw new HttpException(
        err?.response?.data || 'Error al crear/verificar configuración en Dynatrace',
        500,
      );
    }
  }
}



