-- Reversión controlada de RFC-000078 (014_simplificar_frecuencias_sin_resoluciones.sql).
-- Conserva ID_COP_PER y NUM_RES_FRE para evitar pérdida de datos; únicamente verifica que
-- todas las frecuencias tengan ID_RES_PER antes de volver a aplicar 011, 012 y 013.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM dbo.FRECUENCIAS WHERE ID_RES_PER IS NULL)
        THROW 51401, 'Existen frecuencias creadas sin ID_RES_PER. Asigna una resolución en RESOLUCIONES_ANT o restaura el respaldo .bak previo al despliegue.', 1;

    IF EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.FRECUENCIAS') AND name = 'IX_CC_FRE_RES')
        DROP INDEX IX_CC_FRE_RES ON dbo.FRECUENCIAS;

    IF COLUMNPROPERTY(OBJECT_ID('dbo.FRECUENCIAS'), 'ID_RES_PER', 'AllowsNull') = 1
        ALTER TABLE dbo.FRECUENCIAS ALTER COLUMN ID_RES_PER varchar(5) NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE object_id = OBJECT_ID('dbo.FRECUENCIAS') AND name = 'IX_CC_FRE_RES')
        CREATE INDEX IX_CC_FRE_RES ON dbo.FRECUENCIAS(ID_RES_PER);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
-- Luego de este script, volver a ejecutar en orden:
--   1. database/scripts/011_frecuencias_vigencia.sql
--   2. database/scripts/012_frecuencias_catalogo_cupos.sql
--   3. database/scripts/013_hojas_ruta_lotes.sql
